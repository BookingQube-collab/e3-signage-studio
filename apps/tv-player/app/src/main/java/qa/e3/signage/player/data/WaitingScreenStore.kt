package qa.e3.signage.player.data

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import qa.e3.signage.player.core.DeviceBrandAsset
import qa.e3.signage.player.core.MediaKind
import qa.e3.signage.player.core.ManifestAsset
import qa.e3.signage.player.core.WaitingScreenBrand
import qa.e3.signage.player.core.WaitingScreenConfig
import qa.e3.signage.player.core.atomicWriteText
import java.io.File

data class WaitingScreenState(
    val brand: WaitingScreenBrand = WaitingScreenBrand.FULL_LOGO,
    val localImagePath: String? = null,
    /** Synced in-app brand icon path (ICON mode). Not the APK launcher icon. */
    val localBrandIconPath: String? = null,
    val title: String? = null,
    val message: String? = null,
    val mediaId: String? = null,
    val checksum: String? = null,
    val brandIconMediaId: String? = null,
    val brandIconChecksum: String? = null,
    val configVersion: Int = 0,
)

@Serializable
private data class WaitingMeta(
    val brand: WaitingScreenBrand = WaitingScreenBrand.FULL_LOGO,
    val mediaId: String? = null,
    val checksum: String? = null,
    val localImagePath: String? = null,
    val localBrandIconPath: String? = null,
    val brandIconMediaId: String? = null,
    val brandIconChecksum: String? = null,
    val title: String? = null,
    val message: String? = null,
    val configVersion: Int = 0,
)

/**
 * Caches the admin-configured idle / waiting screen from sync-status.
 * Falls back to the built-in E3 full logo when no custom image is configured.
 * Also caches the optional in-app brand icon (not the Android launcher icon).
 */
class WaitingScreenStore(
    private val filesDir: File,
    private val downloader: AssetDownloader,
    private val json: Json,
) {
    private val dir = File(filesDir, "waiting").apply { mkdirs() }
    private val metaFile = File(dir, "meta.json")
    private val _state = MutableStateFlow(loadPersisted())
    val state: StateFlow<WaitingScreenState> = _state.asStateFlow()

    fun applyFromSync(config: WaitingScreenConfig?) {
        if (config == null) {
            clearImageKeepCopy(WaitingScreenBrand.FULL_LOGO, null, null, null, 0)
            return
        }
        val title = config.title?.trim()?.takeIf { it.isNotEmpty() }
        val message = config.message?.trim()?.takeIf { it.isNotEmpty() }
        val brand = config.brand
        val mediaId = config.mediaId
        val checksum = config.checksum?.lowercase()
        val downloadUrl = config.downloadUrl
        val version = config.version ?: 1
        val fileSize = config.fileSize ?: 0L
        val mimeType = config.mimeType ?: "image/jpeg"
        val brandIconPath = downloadBrandIcon(config.brandIcon)

        if (
            brand != WaitingScreenBrand.CUSTOM ||
            mediaId.isNullOrBlank() ||
            checksum.isNullOrBlank() ||
            downloadUrl.isNullOrBlank()
        ) {
            val resolved =
                if (brand == WaitingScreenBrand.CUSTOM) WaitingScreenBrand.FULL_LOGO else brand
            clearImageKeepCopy(resolved, title, message, brandIconPath, config.configVersion)
            return
        }

        val current = _state.value
        if (
            current.brand == WaitingScreenBrand.CUSTOM &&
            current.mediaId == mediaId &&
            current.checksum == checksum &&
            !current.localImagePath.isNullOrBlank() &&
            File(current.localImagePath).isFile
        ) {
            val next = current.copy(
                brand = WaitingScreenBrand.CUSTOM,
                title = title,
                message = message,
                localBrandIconPath = brandIconPath?.path,
                brandIconMediaId = brandIconPath?.mediaId,
                brandIconChecksum = brandIconPath?.checksum,
                configVersion = config.configVersion,
            )
            _state.value = next
            persist(next)
            return
        }

        try {
            val filename = localFilenameFor(mimeType, mediaId, prefix = "waiting")
            val asset = ManifestAsset(
                id = mediaId,
                version = version,
                type = MediaKind.IMAGE,
                checksum = checksum,
                fileSize = fileSize,
                localFilename = filename,
                mimeType = mimeType,
                downloadUrl = downloadUrl,
            )
            val file = downloader.downloadVerified(asset, filesDir) { }
            val next = WaitingScreenState(
                brand = WaitingScreenBrand.CUSTOM,
                localImagePath = file.absolutePath,
                localBrandIconPath = brandIconPath?.path,
                title = title,
                message = message,
                mediaId = mediaId,
                checksum = checksum,
                brandIconMediaId = brandIconPath?.mediaId,
                brandIconChecksum = brandIconPath?.checksum,
                configVersion = config.configVersion,
            )
            _state.value = next
            persist(next)
        } catch (error: Exception) {
            Log.w(TAG, "waiting image: ${error.message}")
            _state.value = WaitingScreenState(
                brand = WaitingScreenBrand.FULL_LOGO,
                localBrandIconPath = brandIconPath?.path,
                title = title,
                message = message,
                brandIconMediaId = brandIconPath?.mediaId,
                brandIconChecksum = brandIconPath?.checksum,
                configVersion = config.configVersion,
            )
            persist(_state.value)
        }
    }

    private data class CachedBrandIcon(
        val path: String,
        val mediaId: String,
        val checksum: String,
    )

    private fun downloadBrandIcon(asset: DeviceBrandAsset?): CachedBrandIcon? {
        if (asset == null) return null
        val mediaId = asset.mediaId.trim().takeIf { it.isNotEmpty() } ?: return null
        val checksum = asset.checksum.lowercase().takeIf { it.isNotEmpty() } ?: return null
        val downloadUrl = asset.downloadUrl.trim().takeIf { it.isNotEmpty() } ?: return null
        val current = _state.value
        if (
            current.brandIconMediaId == mediaId &&
            current.brandIconChecksum == checksum &&
            !current.localBrandIconPath.isNullOrBlank() &&
            File(current.localBrandIconPath).isFile
        ) {
            return CachedBrandIcon(current.localBrandIconPath, mediaId, checksum)
        }
        return try {
            val filename = localFilenameFor(asset.mimeType, mediaId, prefix = "brand-icon")
            val manifestAsset = ManifestAsset(
                id = mediaId,
                version = asset.version.coerceAtLeast(1),
                type = MediaKind.IMAGE,
                checksum = checksum,
                fileSize = asset.fileSize.coerceAtLeast(0L),
                localFilename = filename,
                mimeType = asset.mimeType.ifBlank { "image/png" },
                downloadUrl = downloadUrl,
            )
            val file = downloader.downloadVerified(manifestAsset, filesDir) { }
            CachedBrandIcon(file.absolutePath, mediaId, checksum)
        } catch (error: Exception) {
            Log.w(TAG, "brand icon: ${error.message}")
            null
        }
    }

    private fun clearImageKeepCopy(
        brand: WaitingScreenBrand,
        title: String?,
        message: String?,
        brandIcon: CachedBrandIcon?,
        configVersion: Int,
    ) {
        val next = WaitingScreenState(
            brand = brand,
            title = title,
            message = message,
            localBrandIconPath = brandIcon?.path,
            brandIconMediaId = brandIcon?.mediaId,
            brandIconChecksum = brandIcon?.checksum,
            configVersion = configVersion,
        )
        _state.value = next
        persist(next)
    }

    private fun persist(state: WaitingScreenState) {
        val meta = WaitingMeta(
            brand = state.brand,
            mediaId = state.mediaId,
            checksum = state.checksum,
            localImagePath = state.localImagePath,
            localBrandIconPath = state.localBrandIconPath,
            brandIconMediaId = state.brandIconMediaId,
            brandIconChecksum = state.brandIconChecksum,
            title = state.title,
            message = state.message,
            configVersion = state.configVersion,
        )
        atomicWriteText(metaFile, json.encodeToString(WaitingMeta.serializer(), meta))
    }

    private fun loadPersisted(): WaitingScreenState {
        if (!metaFile.isFile) return WaitingScreenState()
        return try {
            val meta = json.decodeFromString(WaitingMeta.serializer(), metaFile.readText())
            val path = meta.localImagePath?.takeIf { File(it).isFile }
            val iconPath = meta.localBrandIconPath?.takeIf { File(it).isFile }
            WaitingScreenState(
                brand = meta.brand,
                localImagePath = path,
                localBrandIconPath = iconPath,
                title = meta.title,
                message = meta.message,
                mediaId = meta.mediaId,
                checksum = meta.checksum,
                brandIconMediaId = meta.brandIconMediaId,
                brandIconChecksum = meta.brandIconChecksum,
                configVersion = meta.configVersion,
            )
        } catch (_: Exception) {
            WaitingScreenState()
        }
    }

    private fun localFilenameFor(mimeType: String, mediaId: String, prefix: String): String {
        val ext = when {
            mimeType.contains("png") -> "png"
            mimeType.contains("webp") -> "webp"
            else -> "jpg"
        }
        val safe = mediaId.filter { it.isLetterOrDigit() }.take(12).ifEmpty { "default" }
        return "$prefix-$safe.$ext"
    }

    private companion object {
        const val TAG = "E3Waiting"
    }
}
