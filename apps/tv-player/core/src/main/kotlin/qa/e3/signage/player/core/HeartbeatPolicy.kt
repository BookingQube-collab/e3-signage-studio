package qa.e3.signage.player.core

import java.time.Instant
import java.time.temporal.ChronoUnit

/** Player poll interval. CMS treats last_heartbeat_at older than 5 minutes as OFFLINE. */
const val HEARTBEAT_INTERVAL_MS = 120_000L
const val HEARTBEAT_OFFLINE_AFTER_MS = 300_000L
const val PLAYBACK_LOG_BATCH_MAX = 500
const val ERROR_LOG_BATCH_MAX = 200
const val UPLOADED_LOG_RETAIN_MS = 7L * 24 * 60 * 60 * 1000

fun heartbeatDue(lastSentAtMs: Long?, nowMs: Long, intervalMs: Long = HEARTBEAT_INTERVAL_MS): Boolean {
    if (lastSentAtMs == null) return true
    return nowMs - lastSentAtMs >= intervalMs
}

fun toIsoDateTime(instant: Instant = Instant.now()): String =
    instant.truncatedTo(ChronoUnit.SECONDS).toString()

fun syncStateForPackage(state: ContentPackageState?): DeviceSyncState {
    return when (state) {
        null -> DeviceSyncState.WAITING
        ContentPackageState.PENDING -> DeviceSyncState.NOTIFIED
        ContentPackageState.DOWNLOADING -> DeviceSyncState.DOWNLOADING
        ContentPackageState.VERIFYING -> DeviceSyncState.VERIFYING
        ContentPackageState.READY -> DeviceSyncState.READY
        ContentPackageState.ACTIVE -> DeviceSyncState.ACTIVE
        ContentPackageState.FAILED -> DeviceSyncState.FAILED
    }
}

fun operationalStatusForPackage(state: ContentPackageState?): ScreenOperationalStatus {
    return when (state) {
        ContentPackageState.PENDING -> ScreenOperationalStatus.SYNCING
        ContentPackageState.DOWNLOADING -> ScreenOperationalStatus.DOWNLOADING
        ContentPackageState.VERIFYING -> ScreenOperationalStatus.VERIFYING
        ContentPackageState.READY -> ScreenOperationalStatus.UPDATING
        ContentPackageState.FAILED -> ScreenOperationalStatus.ERROR
        ContentPackageState.ACTIVE, null -> ScreenOperationalStatus.READY
    }
}

fun syncProgressForPackage(state: ContentPackageState?): Int {
    return when (state) {
        ContentPackageState.PENDING -> 0
        ContentPackageState.DOWNLOADING -> 40
        ContentPackageState.VERIFYING -> 80
        ContentPackageState.READY -> 95
        ContentPackageState.ACTIVE -> 100
        ContentPackageState.FAILED -> 0
        null -> 0
    }
}
