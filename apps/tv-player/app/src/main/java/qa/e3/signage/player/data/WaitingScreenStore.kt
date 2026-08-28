package qa.e3.signage.player.data

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import qa.e3.signage.player.core.MediaKind
import qa.e3.signage.player.core.ManifestAsset
import qa.e3.signage.player.core.WaitingScreenConfig
import qa.e3.signage.player.core.atomicWriteText
import java.io.File

data class WaitingScreenState(
    val localImagePath: String? = null,
    val title: String? = null,
    val message: String? = null,
    val mediaId: String? = null,
    val checksum: String? = null,
    val configVersion: Int = 0,
)

@Serializable
private data class WaitingMeta(
    val mediaId: String? = null,
    val checksum: String? = null,
    val localImagePath: String? = null,
    val title: String? = null,
    val message: String? = null,
    val configVersion: Int = 0,
)

/**
 * Caches the admin-configured idle / waiting screen from sync-status.
 * Falls back to the built-in E3 brand stage when no image is configured.
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
            clearImageKeepCopy(null, null, 0)
            return
        }
        val title = config.title?.trim()?.takeIf { it.isNotEmpty() }
        val message = config.message?.trim()?.takeIf { it.isNotEmpty() }
        val mediaId = config.mediaId
        val checksum = config.checksum?.lowercase()
        val downloadUrl = config.downloadUrl
        val version = config.version ?: 1
        val fileSize = config.fileSize ?: 0L
        val mimeType = config.mimeType ?: "image/jpeg"

        if (mediaId.isNullOrBlank() || checksum.isNullOrBlank() || downloadUrl.isNullOrBlank()) {
            clearImageKeepCopy(title, message, config.configVersion)
            return
        }

        val current = _state.value
        if (
            current.mediaId == mediaId &&
            current.checksum == checksum &&
            !current.localImagePath.isNullOrBlank() &&
            File(current.localImagePath).isFile
        ) {
            val next = current.copy(
                title = title,
                message = message,
                configVersion = config.configVersion,
            )
            _state.value = next
            persist(next)
            return
        }

        try {
            val filename = localFilenameFor(mimeType, mediaId)
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
                localImagePath = file.absolutePath,
                title = title,
                message = message,
                mediaId = mediaId,
                checksum = checksum,
                configVersion = config.configVersion,
            )
            _state.value = next
            persist(next)
        } catch (error: Exception) {
            Log.w(TAG, "waiting image: ${error.message}")
            _state.value = current.copy(
                title = title,
                message = message,
                configVersion = config.configVersion,
            )
            persist(_state.value)
        }
    }

    private fun clearImageKeepCopy(title: String?, message: String?, configVersion: Int) {
        val next = WaitingScreenState(
            title = title,
            message = message,
            configVersion = configVersion,
        )
        _state.value = next
        persist(next)
    }

    private fun persist(state: WaitingScreenState) {
        val meta = WaitingMeta(
            mediaId = state.mediaId,
            checksum = state.checksum,
            localImagePath = state.localImagePath,
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
            WaitingScreenState(
                localImagePath = path,
                title = meta.title,
                message = meta.message,
                mediaId = meta.mediaId,
                checksum = meta.checksum,
                configVersion = meta.configVersion,
            )
        } catch (_: Exception) {
            WaitingScreenState()
        }
    }

    private fun localFilenameFor(mimeType: String, mediaId: String): String {
        val ext = when {
            mimeType.contains("png") -> "png"
            mimeType.contains("webp") -> "webp"
            else -> "jpg"
        }
        val safe = mediaId.filter { it.isLetterOrDigit() }.take(12).ifEmpty { "default" }
        return "waiting-$safe.$ext"
    }

    private companion object {
        const val TAG = "E3Waiting"
    }
}
