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
import qa.e3.signage.player.core.expectedMediaFile
import qa.e3.signage.player.core.firstInvalidAsset
import qa.e3.signage.player.core.planDownloads
import qa.e3.signage.player.core.progressPercent
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
    private val onActivated: () -> Unit = {},
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
            return
        }
        packages.noteCloudVersion(status.manifestVersion)

        val activeVersion = packages.activeVersion() ?: 0
        val inflight = inflightFor(status.manifestVersion)
        if (inflight == null &&
            !shouldFetchManifest(status.manifestVersion, activeVersion, status.syncRequested)
        ) {
            return
        }

        val manifest = try {
            loadOrFetchManifest(credentials, status.manifestVersion, inflight) ?: return
        } catch (_: ScreenDisabledException) {
            Log.w(TAG, "screen disabled; keeping previous ACTIVE")
            val path = inflight?.manifestPath.orEmpty()
            if (inflight != null && inflight.state != ContentPackageState.ACTIVE.name) {
                failInflight(credentials, status.manifestVersion, path, error = "This screen is disabled.")
            }
            return
        }

        if (manifest.manifestVersion == activeVersion && inflight == null) {
            confirm(credentials, manifest.manifestVersion, ContentPackageState.ACTIVE)
            return
        }

        val manifestFile = versionedManifestFile(File(filesDir, "manifests"), manifest.manifestVersion)
        val path = if (manifestFile.isFile) {
            manifestFile.canonicalPath
        } else {
            packages.writePendingManifest(manifest).canonicalPath
        }

        try {
            downloadAndActivate(credentials, manifest, path)
        } catch (_: ScreenDisabledException) {
            Log.w(TAG, "screen disabled; keeping previous ACTIVE")
            failInflight(credentials, manifest.manifestVersion, path, error = "This screen is disabled.")
        } catch (error: ChecksumFailedException) {
            failInflight(
                credentials,
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
            packages.persistPackage(manifest.manifestVersion, ContentPackageState.DOWNLOADING, path)
            packages.noteError(error.message)
        } catch (error: Exception) {
            Log.w(TAG, "package sync failed: ${error.message}")
            failInflight(credentials, manifest.manifestVersion, path, error = error.message)
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
    ): ContentManifest? {
        val localFile = inflight?.manifestPath?.let { File(it) }?.takeIf { it.isFile }
            ?: versionedManifestFile(File(filesDir, "manifests"), version).takeIf { it.isFile }
        if (localFile != null) {
            packages.readManifestFile(localFile)?.let { return it }
        }
        return try {
            val fetched = api.manifest(credentials.deviceId, credentials.deviceToken)
            packages.writePendingManifest(fetched)
            fetched
        } catch (error: DeviceHttpException) {
            if (error.httpCode == 403) throw ScreenDisabledException()
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
    ) {
        val existing = packages.findByVersion(manifest.manifestVersion)
        val existingState = existing?.state?.let { runCatching { ContentPackageState.valueOf(it) }.getOrNull() }
        if (existingState == ContentPackageState.READY) {
            activate(credentials, manifest, path)
            return
        }

        packages.persistPackage(manifest.manifestVersion, ContentPackageState.DOWNLOADING, path)
        confirm(credentials, manifest.manifestVersion, ContentPackageState.DOWNLOADING)

        val plan = planDownloads(manifest.assets, packages.inventory())
        var completedBytes = 0L
        val needed = plan.neededBytes
        var lastLogged = -25
        for (asset in plan.toFetch) {
            val file = downloader.downloadVerified(asset, filesDir) { soFar ->
                val pct = progressPercent(completedBytes + soFar, needed)
                if (pct >= lastLogged + 25) {
                    lastLogged = pct
                    Log.i(TAG, "download $pct% of needed bytes (${asset.localFilename})")
                }
            }
            packages.saveAsset(asset, file.canonicalPath)
            completedBytes += asset.fileSize.coerceAtLeast(0L)
        }

        packages.persistPackage(manifest.manifestVersion, ContentPackageState.VERIFYING, path)
        confirm(credentials, manifest.manifestVersion, ContentPackageState.VERIFYING)

        var invalid = firstInvalidAsset(filesDir, manifest.assets)
        var repairs = 0
        while (invalid != null && repairs < 1) {
            runCatching { expectedMediaFile(filesDir, invalid).delete() }
            val repaired = downloader.downloadVerified(invalid, filesDir) {}
            packages.saveAsset(invalid, repaired.canonicalPath)
            repairs += 1
            invalid = firstInvalidAsset(filesDir, manifest.assets)
        }
        if (invalid != null) {
            runCatching { expectedMediaFile(filesDir, invalid).delete() }
            throw ChecksumFailedException(invalid.id, invalid.localFilename)
        }

        packages.saveAssets(manifest)
        packages.persistPackage(manifest.manifestVersion, ContentPackageState.READY, path)
        confirm(credentials, manifest.manifestVersion, ContentPackageState.READY)
        activate(credentials, manifest, path)
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
        confirm(credentials, manifest.manifestVersion, ContentPackageState.ACTIVE)
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
