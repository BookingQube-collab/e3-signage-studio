package qa.e3.signage.player.core

import java.io.File
import java.net.URI

fun isRemotePlaybackUri(value: String): Boolean {
    val lower = value.trim().lowercase()
    return lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.startsWith("content://") ||
        "://http" in lower
}

fun localFileUri(file: File): String {
    val canonical = file.canonicalFile
    require(canonical.isFile) { "Missing local media file." }
    val uri = canonical.toURI().toString()
    require(uri.startsWith("file:")) { "Playback URI must be file://." }
    require(!isRemotePlaybackUri(uri)) { "Cloud URLs cannot be used for playback." }
    return uri
}

fun requireLocalPlaybackUri(uri: String): URI {
    require(!isRemotePlaybackUri(uri)) { "Cloud URLs cannot be used for playback." }
    require(uri.startsWith("file:")) { "Playback URI must be file://." }
    return URI(uri)
}

fun mediaFolder(type: MediaKind): String = when (type) {
    MediaKind.VIDEO -> "video"
    MediaKind.AUDIO -> "audio"
    else -> "image"
}

fun safeLocalFilename(filename: String): String? {
    val name = filename.substringAfterLast('/').substringAfterLast('\\')
    if (name.isBlank() || name.contains("..")) return null
    return name
}

fun resolveLocalMedia(root: File, type: MediaKind, filename: String): File? {
    val name = safeLocalFilename(filename) ?: return null
    val folders = when (type) {
        MediaKind.VIDEO -> listOf("video", "image", "audio")
        MediaKind.AUDIO -> listOf("audio", "image", "video")
        else -> listOf("image", "video", "audio")
    }
    val candidates = folders.map { File(File(root, "media/$it"), name) } + File(root, name)
    return candidates.firstOrNull { it.isFile }
}
