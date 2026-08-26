package qa.e3.signage.player.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.StatFs
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import qa.e3.signage.player.core.ContentPackageState
import qa.e3.signage.player.core.DeviceApi
import qa.e3.signage.player.core.DeviceCredentialStore
import qa.e3.signage.player.core.DeviceHeartbeatRequest
import qa.e3.signage.player.core.DeviceHttpException
import qa.e3.signage.player.core.ErrorLogBatch
import qa.e3.signage.player.core.ErrorLogEvent
import qa.e3.signage.player.core.PlaybackLogBatch
import qa.e3.signage.player.core.PlaybackLogEvent
import qa.e3.signage.player.core.QueuedUpload
import qa.e3.signage.player.core.StoredPlaybackEvent
import qa.e3.signage.player.core.latestHeartbeatPayload
import qa.e3.signage.player.core.newBatchId
import qa.e3.signage.player.core.newPlaybackEventId
import qa.e3.signage.player.core.nextPlaybackBatch
import qa.e3.signage.player.core.operationalStatusForPackage
import qa.e3.signage.player.core.persistRotatedToken
import qa.e3.signage.player.core.shouldRetainUploadedLog
import qa.e3.signage.player.core.syncProgressForPackage
import qa.e3.signage.player.core.syncStateForPackage
import qa.e3.signage.player.core.toIsoDateTime
import java.io.File
import java.util.UUID

class DeviceTelemetry(
    context: Context,
    private val api: DeviceApi,
    private val store: DeviceCredentialStore,
    private val db: PlayerDatabase,
    private val json: Json,
    private val filesDir: File,
    private val appVersion: String,
) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val mutex = Mutex()

    fun noteSuccessfulSync() {
        prefs.edit().putString(KEY_LAST_SYNC, toIsoDateTime()).apply()
    }

    suspend fun sendHeartbeat(
        playingMediaId: String?,
        playlistId: String?,
        manifestVersion: Int?,
        packageState: ContentPackageState?,
        lastError: String?,
    ) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val credentials = store.read() ?: return@withLock
                val body = DeviceHeartbeatRequest(
                    screenId = credentials.screenId,
                    appVersion = appVersion,
                    uptimeSeconds = (SystemClock.elapsedRealtime() / 1000L).toInt().coerceAtLeast(0),
                    activeManifestVersion = manifestVersion ?: 0,
                    activePlaylistId = playlistId,
                    currentlyPlayingMediaId = playingMediaId,
                    totalStorageBytes = storage().first,
                    availableStorageBytes = storage().second,
                    networkOnline = isOnline(),
                    lastSuccessfulSyncAt = prefs.getString(KEY_LAST_SYNC, null),
                    lastError = lastError,
                    operationalStatus = operationalStatusForPackage(packageState),
                    syncState = syncStateForPackage(packageState),
                    syncProgress = syncProgressForPackage(packageState),
                )
                val encoded = json.encodeToString(DeviceHeartbeatRequest.serializer(), body)
                if (!isOnline()) {
                    queueHeartbeat(encoded)
                    return@withLock
                }
                try {
                    val ack = api.heartbeat(credentials.deviceId, credentials.deviceToken, body)
                    persistRotatedToken(store, ack.rotatedToken)
                    db.pendingUploadDao().deleteKind(QueuedUpload.KIND_HEARTBEAT)
                    prefs.edit().putLong(KEY_LAST_SENT, System.currentTimeMillis()).apply()
                    val live = store.read() ?: credentials
                    flushLocked(live.deviceId, live.deviceToken, live.screenId)
                } catch (error: Exception) {
                    Log.w(TAG, "heartbeat: ${error.message}")
                    queueHeartbeat(encoded)
                }
            }
        }
    }

    suspend fun recordPlayback(event: PlaybackLogEvent) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                db.playbackLogDao().upsert(
                    PlaybackLogEntity(
                        clientEventId = event.clientEventId,
                        payloadJson = json.encodeToString(
                            StoredPlaybackEvent.serializer(),
                            StoredPlaybackEvent(event = event),
                        ),
                        uploaded = false,
                    ),
                )
            }
        }
    }

    suspend fun recordError(code: String, message: String, mediaId: String? = null, manifestVersion: Int? = null) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val event = ErrorLogEvent(
                    clientEventId = newPlaybackEventId(),
                    at = toIsoDateTime(),
                    code = code.take(80),
                    message = message.take(2000),
                    mediaId = mediaId,
                    manifestVersion = manifestVersion,
                )
                db.errorLogDao().upsert(
                    ErrorLogEntity(
                        clientEventId = event.clientEventId,
                        payloadJson = json.encodeToString(ErrorLogEvent.serializer(), event),
                        uploaded = false,
                    ),
                )
            }
        }
    }

    suspend fun flush() {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val credentials = store.read() ?: return@withLock
                if (!isOnline()) return@withLock
                flushLocked(credentials.deviceId, credentials.deviceToken, credentials.screenId)
            }
        }
    }

    private suspend fun flushLocked(deviceId: String, token: String, screenId: String) {
        flushHeartbeatQueue(deviceId, token)
        flushPlayback(deviceId, token, screenId)
        flushErrors(deviceId, token, screenId)
        pruneUploaded()
    }

    private suspend fun flushHeartbeatQueue(deviceId: String, token: String) {
        val queued = db.pendingUploadDao().all().map {
            QueuedUpload(it.id, it.kind, it.payloadJson, it.createdAt)
        }
        val latest = latestHeartbeatPayload(queued) ?: return
        val body = runCatching {
            json.decodeFromString(DeviceHeartbeatRequest.serializer(), latest.payloadJson)
        }.getOrNull() ?: return
        try {
            val ack = api.heartbeat(deviceId, token, body)
            persistRotatedToken(store, ack.rotatedToken)
            db.pendingUploadDao().deleteKind(QueuedUpload.KIND_HEARTBEAT)
        } catch (error: Exception) {
            Log.w(TAG, "queued heartbeat: ${error.message}")
        }
    }

    private suspend fun flushPlayback(deviceId: String, token: String, screenId: String) {
        val pending = db.playbackLogDao().pending().mapNotNull { row ->
            runCatching { json.decodeFromString(StoredPlaybackEvent.serializer(), row.payloadJson) }.getOrNull()
        }
        if (pending.isEmpty()) return
        val batchRows = nextPlaybackBatch(pending)
        val batchId = batchRows.first().batchId ?: newBatchId()
        batchRows.forEach { stored ->
            db.playbackLogDao().upsert(
                PlaybackLogEntity(
                    clientEventId = stored.event.clientEventId,
                    payloadJson = json.encodeToString(
                        StoredPlaybackEvent.serializer(),
                        stored.copy(batchId = batchId),
                    ),
                    uploaded = false,
                ),
            )
        }
        try {
            api.playbackLogs(
                deviceId,
                token,
                PlaybackLogBatch(
                    batchId = batchId,
                    screenId = screenId,
                    events = batchRows.map { it.event },
                ),
            )
            batchRows.forEach { stored ->
                db.playbackLogDao().upsert(
                    PlaybackLogEntity(
                        clientEventId = stored.event.clientEventId,
                        payloadJson = json.encodeToString(
                            StoredPlaybackEvent.serializer(),
                            stored.copy(batchId = batchId, uploadedAtMs = System.currentTimeMillis()),
                        ),
                        uploaded = true,
                    ),
                )
            }
        } catch (error: DeviceHttpException) {
            Log.w(TAG, "playback-logs ${error.httpCode}: ${error.message}")
            if (error.httpCode in 400..499 && error.httpCode != 401 && error.httpCode != 403) {
                batchRows.forEach { db.playbackLogDao().delete(it.event.clientEventId) }
            }
        } catch (error: Exception) {
            Log.w(TAG, "playback-logs: ${error.message}")
        }
    }

    private suspend fun flushErrors(deviceId: String, token: String, screenId: String) {
        val pending = db.errorLogDao().pending()
        if (pending.isEmpty()) return
        val events = pending.mapNotNull { row ->
            runCatching { json.decodeFromString(ErrorLogEvent.serializer(), row.payloadJson) }.getOrNull()
        }
        if (events.isEmpty()) return
        try {
            api.errorLogs(
                deviceId,
                token,
                ErrorLogBatch(batchId = newBatchId(), screenId = screenId, events = events.take(200)),
            )
            events.forEach { db.errorLogDao().delete(it.clientEventId) }
        } catch (error: DeviceHttpException) {
            Log.w(TAG, "error-logs ${error.httpCode}: ${error.message}")
            if (error.httpCode in 400..499 && error.httpCode != 401 && error.httpCode != 403) {
                events.forEach { db.errorLogDao().delete(it.clientEventId) }
            }
        } catch (error: Exception) {
            Log.w(TAG, "error-logs: ${error.message}")
        }
    }

    private suspend fun pruneUploaded() {
        val now = System.currentTimeMillis()
        db.playbackLogDao().uploaded().forEach { row ->
            val stored = runCatching {
                json.decodeFromString(StoredPlaybackEvent.serializer(), row.payloadJson)
            }.getOrNull()
            val uploadedAt = stored?.uploadedAtMs ?: 0L
            if (!shouldRetainUploadedLog(uploadedAt, now)) {
                db.playbackLogDao().delete(row.clientEventId)
            }
        }
        db.errorLogDao().deleteUploaded()
    }

    private suspend fun queueHeartbeat(payloadJson: String) {
        db.pendingUploadDao().deleteKind(QueuedUpload.KIND_HEARTBEAT)
        db.pendingUploadDao().upsert(
            PendingUploadEntity(
                id = UUID.randomUUID().toString(),
                kind = QueuedUpload.KIND_HEARTBEAT,
                payloadJson = payloadJson,
                createdAt = System.currentTimeMillis(),
            ),
        )
    }

    private fun storage(): Pair<Long, Long> {
        return runCatching {
            val stat = StatFs(filesDir.absolutePath)
            val total = stat.blockCountLong * stat.blockSizeLong
            val available = stat.availableBlocksLong * stat.blockSizeLong
            total.coerceAtLeast(0L) to available.coerceAtLeast(0L)
        }.getOrDefault(0L to 0L)
    }

    private fun isOnline(): Boolean {
        val cm = appContext.getSystemService(ConnectivityManager::class.java) ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private companion object {
        const val TAG = "E3Heartbeat"
        const val PREFS = "e3_telemetry"
        const val KEY_LAST_SYNC = "last_successful_sync_at"
        const val KEY_LAST_SENT = "last_heartbeat_sent_at"
    }
}
