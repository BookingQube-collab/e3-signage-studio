package qa.e3.signage.player.data

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import qa.e3.signage.player.core.ContentManifest
import qa.e3.signage.player.core.ContentPackageState
import qa.e3.signage.player.core.DeviceApi
import qa.e3.signage.player.core.DeviceCredentials
import qa.e3.signage.player.core.DeviceCredentialStore
import qa.e3.signage.player.core.DeviceHttpException
import qa.e3.signage.player.core.SyncConfirmationRequest
import qa.e3.signage.player.core.assetsSequenceKey
import qa.e3.signage.player.core.expectedMediaFile
import qa.e3.signage.player.core.firstCorruptPresentAsset
import qa.e3.signage.player.core.firstInvalidAsset
import qa.e3.signage.player.core.hasPlayableLocalPlaylistItem
import qa.e3.signage.player.core.layoutsSequenceKey
import qa.e3.signage.player.core.persistRotatedToken
import qa.e3.signage.player.core.planDownloads
import qa.e3.signage.player.core.playlistSequenceKey
import qa.e3.signage.player.core.progressPercent
import qa.e3.signage.player.core.pruneUnusedStorage
import qa.e3.signage.player.core.scheduleWindowsKey
import qa.e3.signage.player.core.shouldFetchManifest
import qa.e3.signage.player.core.versionedManifestFile
import java.io.File
import java.io.IOException

class PackageSyncCoordinator(
    private val api: DeviceApi,
    private val store: DeviceCredentialStore,
    private val packages: LocalPackageStore,
    private val downloader: AssetDownloader,
    private val filesDir: File,
    private val waitingScreen: WaitingScreenStore,
    private val display: ScreenDisplayStore,
    private val syncProgress: SyncProgressStore,
    private val onActivated: () -> Unit = {},
    private val onAuthFailure: (httpCode: Int, source: String) -> Boolean = { _, _ -> false },
) {
    private val mutex = Mutex()
    private val _activations = MutableSharedFlow<Int>(extraBufferCapacity = 1)
    val activations: SharedFlow<Int> = _activations

    suspend fun syncIfNeeded() {
        withContext(Dispatchers.IO) {
            mutex.withLock { runLocked() }
        }
    }

    private suspend fun runLocked() {
        val credentials = store.read() ?: return
        val status = try {
            api.syncStatus(credentials.deviceId, credentials.deviceToken)
        } catch (error: Exception) {
            Log.w(TAG, "sync-status: ${error.message}")
            if (error is DeviceHttpException) {
                onAuthFailure(error.httpCode, "sync-status")
            }
            return
        }
        persistRotatedToken(store, status.rotatedToken)
        val live = store.read() ?: credentials
        packages.noteCloudVersion(status.manifestVersion)
        waitingScreen.applyFromSync(status.waitingScreen)
        // Always refresh mount orientation from sync-status — even when the manifest
        // version is unchanged (playlist-only Sync Now must still rotate Landscape↔Portrait).
        display.applyFromSync(status.orientation, status.width, status.height)

        val activeVersion = packages.activeVersion() ?: 0
        val inflight = inflightFor(status.manifestVersion)
        if (inflight == null &&
            !shouldFetchManifest(status.manifestVersion, activeVersion, status.syncRequested)
        ) {
            // Same version ACTIVE but some assets may still be missing (progressive play).
            if (status.manifestVersion == activeVersion && activeVersion > 0) {
                val activeManifest = packages.loadActive()?.first
                if (activeManifest != null) {
                    val remaining = planDownloads(activeManifest.assets, packages.inventory(), activeManifest.playlist)
                    if (remaining.toFetch.isNotEmpty()) {
                        val path = packages.writeManifestFile(activeManifest).canonicalPath
                        try {
                            downloadAndActivate(live, activeManifest, path, alreadyActive = true)
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Exception) {
                            Log.w(TAG, "resume remaining assets: ${error.message}")
                            syncProgress.fail(error.message)
                            packages.noteError(error.message)
                        }
                    }
                }
            }
            return
        }

        val forceNetwork = status.syncRequested || status.manifestVersion > activeVersion
        val manifest = try {
            loadOrFetchManifest(live, status.manifestVersion, inflight, forceNetwork) ?: return
        } catch (_: ScreenDisabledException) {
            Log.w(TAG, "screen disabled; keeping previous ACTIVE")
            val path = inflight?.manifestPath.orEmpty()
            if (inflight != null && inflight.state != ContentPackageState.ACTIVE.name) {
                failInflight(live, status.manifestVersion, path, error = "This screen is disabled.")
            }
            return
        }

        if (manifest.manifestVersion == activeVersion && inflight == null) {
            val active = packages.loadActive()?.first
            val activePlaylistKey = active?.let { playlistSequenceKey(it.playlist) }
            val incomingPlaylistKey = playlistSequenceKey(manifest.playlist)
            val activeScheduleKey = active?.let { scheduleWindowsKey(it.schedules) }
            val incomingScheduleKey = scheduleWindowsKey(manifest.schedules)
            val activeLayoutsKey = active?.let { layoutsSequenceKey(it.layouts) }
            val incomingLayoutsKey = layoutsSequenceKey(manifest.layouts)
            val activeAssetsKey = active?.let { assetsSequenceKey(it.assets) }
            val incomingAssetsKey = assetsSequenceKey(manifest.assets)
            val refreshSameVersion =
                status.syncRequested &&
                    (
                        activePlaylistKey != incomingPlaylistKey ||
                            activeScheduleKey != incomingScheduleKey ||
                            activeLayoutsKey != incomingLayoutsKey ||
                            activeAssetsKey != incomingAssetsKey
                        )
            if (refreshSameVersion) {
                Log.i(TAG, "same version but content changed; refreshing ACTIVE package")
                val path = packages.writeManifestFile(manifest).canonicalPath
                packages.persistPackage(manifest.manifestVersion, ContentPackageState.READY, path)
                activate(live, manifest, path)
                return
            }
            val remaining = planDownloads(manifest.assets, packages.inventory(), manifest.playlist)
            if (remaining.toFetch.isNotEmpty()) {
                val path = packages.writeManifestFile(manifest).canonicalPath
                downloadAndActivate(live, manifest, path, alreadyActive = true)
                return
            }
            confirm(live, manifest.manifestVersion, ContentPackageState.ACTIVE)
            syncProgress.clear()
            return
        }

        val manifestFile = versionedManifestFile(File(filesDir, "manifests"), manifest.manifestVersion)
        val path = if (manifestFile.isFile) {
            manifestFile.canonicalPath
        } else {
            packages.writePendingManifest(manifest).canonicalPath
        }

        try {
            downloadAndActivate(live, manifest, path, alreadyActive = false)
        } catch (_: ScreenDisabledException) {
            Log.w(TAG, "screen disabled; keeping previous ACTIVE")
            failInflight(live, manifest.manifestVersion, path, error = "This screen is disabled.")
        } catch (error: ChecksumFailedException) {
            failInflight(
                live,
                manifest.manifestVersion,
                path,
                failedAssetId = error.assetId,
                error = error.message,
            )
        } catch (error: CancellationException) {
            packages.persistPackage(manifest.manifestVersion, ContentPackageState.DOWNLOADING, path)
            throw error
        } catch (error: IOException) {
            Log.w(TAG, "download paused at ${error.message}")
            if (packages.activeVersion() == manifest.manifestVersion) {
                // Partial package already playing — keep ACTIVE, resume later.
                syncProgress.fail(error.message)
                packages.noteError(error.message)
            } else {
                packages.persistPackage(manifest.manifestVersion, ContentPackageState.DOWNLOADING, path)
                syncProgress.fail(error.message)
                packages.noteError(error.message)
            }
        } catch (error: Exception) {
            Log.w(TAG, "package sync failed: ${error.message}")
            if (packages.activeVersion() == manifest.manifestVersion) {
                syncProgress.fail(error.message)
                packages.noteError(error.message)
            } else {
                failInflight(live, manifest.manifestVersion, path, error = error.message)
            }
        }
    }

    private suspend fun inflightFor(version: Int): ContentPackageEntity? {
        val row = packages.findByVersion(version) ?: return null
        val state = runCatching { ContentPackageState.valueOf(row.state) }.getOrNull() ?: return null
        return row.takeIf {
            state == ContentPackageState.PENDING ||
                state == ContentPackageState.DOWNLOADING ||
                state == ContentPackageState.VERIFYING ||
                state == ContentPackageState.READY ||
                state == ContentPackageState.FAILED
        }
    }

    private suspend fun loadOrFetchManifest(
        credentials: DeviceCredentials,
        version: Int,
        inflight: ContentPackageEntity?,
        forceNetwork: Boolean,
    ): ContentManifest? {
        if (!forceNetwork) {
            val localFile = inflight?.manifestPath?.let { File(it) }?.takeIf { it.isFile }
                ?: versionedManifestFile(File(filesDir, "manifests"), version).takeIf { it.isFile }
            if (localFile != null) {
                packages.readManifestFile(localFile)?.let { return it }
            }
        }
        return try {
            val fetched = api.manifest(credentials.deviceId, credentials.deviceToken)
            val existing = packages.findByVersion(fetched.manifestVersion)
            val existingState = existing?.state?.let { runCatching { ContentPackageState.valueOf(it) }.getOrNull() }
            if (existingState == ContentPackageState.ACTIVE) {
                packages.writeManifestFile(fetched)
            } else {
                packages.writePendingManifest(fetched)
            }
            fetched
        } catch (error: DeviceHttpException) {
            if (error.httpCode == 403) throw ScreenDisabledException()
            if (error.httpCode == 401) {
                onAuthFailure(401, "manifest")
                return null
            }
            if (error.httpCode == 404) {
                Log.i(TAG, "No published content yet")
                return null
            }
            Log.w(TAG, "manifest: ${error.message}")
            null
        }
    }

    private suspend fun downloadAndActivate(
        credentials: DeviceCredentials,
        manifest: ContentManifest,
        path: String,
        alreadyActive: Boolean,
    ) {
        val existing = packages.findByVersion(manifest.manifestVersion)
        val existingState = existing?.state?.let { runCatching { ContentPackageState.valueOf(it) }.getOrNull() }
        if (existingState == ContentPackageState.READY && !alreadyActive) {
            activate(credentials, manifest, path)
            syncProgress.clear()
            return
        }

        if (!alreadyActive) {
            packages.persistPackage(manifest.manifestVersion, ContentPackageState.DOWNLOADING, path)
            confirm(credentials, manifest.manifestVersion, ContentPackageState.DOWNLOADING)
        }

        val plan = planDownloads(manifest.assets, packages.inventory(), manifest.playlist)
        val needed = plan.neededBytes
        val filesTotal = plan.toFetch.size
        syncProgress.beginDownload(filesTotal, needed)

        // Already-local playlist items can activate immediately (skip waiting for toFetch).
        var activated = alreadyActive || packages.activeVersion() == manifest.manifestVersion
        if (!activated && hasPlayableLocalPlaylistItem(manifest, filesDir)) {
            packages.saveAssets(manifest)
            packages.persistPackage(manifest.manifestVersion, ContentPackageState.READY, path)
            confirm(credentials, manifest.manifestVersion, ContentPackageState.READY)
            activate(credentials, manifest, path)
            activated = true
            Log.i(TAG, "early ACTIVE v${manifest.manifestVersion} from cached playlist media")
        }

        if (plan.toFetch.isEmpty()) {
            finishFullPackage(credentials, manifest, path, activated)
            return
        }

        var completedBytes = 0L
        var filesDone = 0
        var lastLogged = -25
        var hardFailure: Exception? = null

        for (asset in plan.toFetch) {
            syncProgress.onFileProgress(
                filesDone = filesDone,
                filesTotal = filesTotal,
                currentFile = asset.localFilename,
                bytesDownloaded = completedBytes,
                bytesTotal = needed,
            )
            try {
                val file = downloader.downloadVerified(asset, filesDir) { soFar ->
                    val pct = progressPercent(completedBytes + soFar, needed)
                    syncProgress.onFileProgress(
                        filesDone = filesDone,
                        filesTotal = filesTotal,
                        currentFile = asset.localFilename,
                        bytesDownloaded = completedBytes + soFar,
                        bytesTotal = needed,
                    )
                    if (pct >= lastLogged + 5) {
                        lastLogged = pct
                        Log.i(TAG, "download $pct% ($filesDone/$filesTotal) ${asset.localFilename}")
                    }
                }
                packages.saveAsset(asset, file.canonicalPath)
                completedBytes += asset.fileSize.coerceAtLeast(0L)
                filesDone += 1
                syncProgress.onFileProgress(
                    filesDone = filesDone,
                    filesTotal = filesTotal,
                    currentFile = asset.localFilename,
                    bytesDownloaded = completedBytes,
                    bytesTotal = needed,
                )

                if (!activated && hasPlayableLocalPlaylistItem(manifest, filesDir)) {
                    packages.saveAssets(manifest)
                    packages.persistPackage(manifest.manifestVersion, ContentPackageState.READY, path)
                    confirm(credentials, manifest.manifestVersion, ContentPackageState.READY)
                    activate(credentials, manifest, path)
                    activated = true
                    Log.i(
                        TAG,
                        "early ACTIVE v${manifest.manifestVersion} after $filesDone/$filesTotal files",
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "asset ${asset.localFilename} failed: ${error.message}")
                hardFailure = error
                // Soft-fail this file and keep going so a bad/slow second clip
                // does not block the first ready video forever.
                if (activated || hasPlayableLocalPlaylistItem(manifest, filesDir)) {
                    if (!activated) {
                        packages.saveAssets(manifest)
                        packages.persistPackage(manifest.manifestVersion, ContentPackageState.READY, path)
                        confirm(credentials, manifest.manifestVersion, ContentPackageState.READY)
                        activate(credentials, manifest, path)
                        activated = true
                        Log.i(TAG, "early ACTIVE after soft-fail on ${asset.localFilename}")
                    }
                    continue
                }
                throw error
            }
        }

        if (!activated) {
            if (hardFailure != null) throw hardFailure
            throw IOException("No playable playlist media after download")
        }

        syncProgress.beginVerifying(filesTotal)
        packages.persistPackage(manifest.manifestVersion, ContentPackageState.VERIFYING, path)
        if (!alreadyActive) {
            confirm(credentials, manifest.manifestVersion, ContentPackageState.VERIFYING)
        }

        var invalid = firstCorruptPresentAsset(filesDir, manifest.assets)
        var repairs = 0
        while (invalid != null && repairs < 1) {
            runCatching { expectedMediaFile(filesDir, invalid).delete() }
            try {
                val repaired = downloader.downloadVerified(invalid, filesDir) {}
                packages.saveAsset(invalid, repaired.canonicalPath)
            } catch (error: Exception) {
                Log.w(TAG, "repair ${invalid.localFilename}: ${error.message}")
                break
            }
            repairs += 1
            invalid = firstCorruptPresentAsset(filesDir, manifest.assets)
        }

        // Only hard-fail when nothing playable remains.
        val stillMissing = firstInvalidAsset(filesDir, manifest.assets)
        if (stillMissing != null && !hasPlayableLocalPlaylistItem(manifest, filesDir)) {
            runCatching { expectedMediaFile(filesDir, stillMissing).delete() }
            throw ChecksumFailedException(stillMissing.id, stillMissing.localFilename)
        }
        if (stillMissing != null) {
            Log.w(TAG, "soft-missing ${stillMissing.localFilename}; playing partial playlist")
            packages.noteError("Partial package: waiting on ${stillMissing.localFilename}")
        }

        packages.saveAssets(manifest)
        if (stillMissing == null) {
            packages.persistPackage(manifest.manifestVersion, ContentPackageState.READY, path)
            if (!alreadyActive) {
                confirm(credentials, manifest.manifestVersion, ContentPackageState.READY)
            }
            if (packages.activeVersion() != manifest.manifestVersion) {
                activate(credentials, manifest, path)
            } else {
                confirm(credentials, manifest.manifestVersion, ContentPackageState.ACTIVE)
                _activations.tryEmit(manifest.manifestVersion)
            }
            syncProgress.clear()
        } else {
            // Stay ACTIVE with partial media; next poll resumes remaining downloads.
            confirm(credentials, manifest.manifestVersion, ContentPackageState.ACTIVE)
            syncProgress.onFileProgress(
                filesDone = filesDone,
                filesTotal = filesTotal,
                currentFile = stillMissing.localFilename,
                bytesDownloaded = completedBytes,
                bytesTotal = needed,
            )
            _activations.tryEmit(manifest.manifestVersion)
        }
    }

    private suspend fun finishFullPackage(
        credentials: DeviceCredentials,
        manifest: ContentManifest,
        path: String,
        activated: Boolean,
    ) {
        packages.saveAssets(manifest)
        if (!activated) {
            packages.persistPackage(manifest.manifestVersion, ContentPackageState.READY, path)
            confirm(credentials, manifest.manifestVersion, ContentPackageState.READY)
            activate(credentials, manifest, path)
        } else {
            confirm(credentials, manifest.manifestVersion, ContentPackageState.ACTIVE)
        }
        syncProgress.clear()
    }

    private suspend fun activate(
        credentials: DeviceCredentials,
        manifest: ContentManifest,
        path: String,
    ) {
        try {
            api.manifest(credentials.deviceId, credentials.deviceToken)
        } catch (error: DeviceHttpException) {
            if (error.httpCode == 403) throw ScreenDisabledException()
        } catch (error: Exception) {
            Log.w(TAG, "pre-activate check: ${error.message}")
        }
        val outcome = packages.switchActive(manifest.manifestVersion, path)
        // Package may carry a fresher orientation than the last sync-status poll.
        display.applyFromSync(manifest.orientation, manifest.width, manifest.height)
        confirm(credentials, manifest.manifestVersion, ContentPackageState.ACTIVE)
        val pruned = pruneUnusedStorage(filesDir, packages.keepAssets(), filesDir.usableSpace)
        if (pruned.deleted.isNotEmpty()) {
            Log.i(TAG, "pruned ${pruned.deleted.size} unused files; kept ${pruned.kept.size} active assets")
        }
        Log.i(TAG, "ACTIVE v${outcome.activeVersion}; previous=${outcome.previousVersion ?: "none"}")
        onActivated()
        _activations.tryEmit(outcome.activeVersion)
    }

    private suspend fun failInflight(
        credentials: DeviceCredentials,
        version: Int,
        path: String,
        failedAssetId: String? = null,
        error: String?,
    ) {
        packages.persistPackage(version, ContentPackageState.FAILED, path)
        packages.noteError(error)
        syncProgress.fail(error)
        confirm(
            credentials,
            version,
            ContentPackageState.FAILED,
            failedAssetId = failedAssetId,
            error = error,
        )
    }

    private suspend fun confirm(
        credentials: DeviceCredentials,
        version: Int,
        state: ContentPackageState,
        failedAssetId: String? = null,
        error: String? = null,
    ) {
        try {
            api.confirmSync(
                credentials.deviceId,
                credentials.deviceToken,
                SyncConfirmationRequest(
                    manifestVersion = version,
                    packageState = state,
                    failedAssetId = failedAssetId,
                    error = error,
                ),
            )
        } catch (confirmError: Exception) {
            Log.w(TAG, "sync-confirmation $state: ${confirmError.message}")
        }
    }

    private class ScreenDisabledException : RuntimeException("This screen is disabled.")

    private companion object {
        const val TAG = "E3Sync"
    }
}
