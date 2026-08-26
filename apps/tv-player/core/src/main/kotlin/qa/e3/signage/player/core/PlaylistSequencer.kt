package qa.e3.signage.player.core

enum class PlaylistItemKind {
    VIDEO,
    IMAGE,
}

data class ResolvedPlaylistItem(
    val mediaId: String,
    val mediaVersionId: String,
    val durationSeconds: Double,
    val transition: String,
    val localFilename: String,
    val kind: PlaylistItemKind,
    val fileUri: String,
)

class PlaylistSequencer(
    items: List<ResolvedPlaylistItem>,
    private val loop: Boolean,
) {
    private val items: List<ResolvedPlaylistItem> = items.filter { !isRemotePlaybackUri(it.fileUri) }
    private var index: Int = 0

    fun isEmpty(): Boolean = items.isEmpty()

    fun size(): Int = items.size

    fun current(): ResolvedPlaylistItem? = items.getOrNull(index)

    fun peekNext(): ResolvedPlaylistItem? {
        if (items.isEmpty()) return null
        val next = index + 1
        return if (next < items.size) items[next] else if (loop) items.first() else null
    }

    fun advance(): ResolvedPlaylistItem? {
        if (items.isEmpty()) return null
        if (index + 1 < items.size) {
            index += 1
            return items[index]
        }
        if (loop) {
            index = 0
            return items[index]
        }
        return null
    }

    fun skipCurrent(): ResolvedPlaylistItem? = advance()
}

fun resolvePlaylistItems(
    playlist: ManifestPlaylist?,
    assets: List<ManifestAsset>,
    root: java.io.File,
): List<ResolvedPlaylistItem> {
    if (playlist == null) return emptyList()
    val byFile = assets.associateBy { it.localFilename }
    val byId = assets.associateBy { it.id }
    return playlist.items.mapNotNull { item ->
        val asset = byFile[item.localFilename] ?: byId[item.mediaId]
        val kind = when (asset?.type) {
            MediaKind.VIDEO -> PlaylistItemKind.VIDEO
            else -> PlaylistItemKind.IMAGE
        }
        val mediaKind = if (kind == PlaylistItemKind.VIDEO) MediaKind.VIDEO else MediaKind.IMAGE
        val file = resolveLocalMedia(root, mediaKind, item.localFilename) ?: return@mapNotNull null
        val uri = runCatching { localFileUri(file) }.getOrNull() ?: return@mapNotNull null
        ResolvedPlaylistItem(
            mediaId = item.mediaId,
            mediaVersionId = item.mediaVersionId,
            durationSeconds = item.durationSeconds.coerceAtLeast(0.1),
            transition = item.transition,
            localFilename = item.localFilename,
            kind = kind,
            fileUri = uri,
        )
    }
}
