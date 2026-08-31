package qa.e3.signage.player.core

import java.io.File

data class LocalAssetRecord(
    val id: String,
    val version: Int,
    val checksum: String,
    val filePresent: Boolean,
)

data class DownloadPlan(
    val toFetch: List<ManifestAsset>,
    val toSkip: List<ManifestAsset>,
    val neededBytes: Long,
)

fun planDownloads(
    assets: List<ManifestAsset>,
    inventory: List<LocalAssetRecord>,
    playlist: ManifestPlaylist? = null,
): DownloadPlan {
    val byId = inventory.associateBy { it.id }
    val toFetch = mutableListOf<ManifestAsset>()
    val toSkip = mutableListOf<ManifestAsset>()
    for (asset in assets) {
        val local = byId[asset.id]
        val matches =
            local != null &&
                local.filePresent &&
                local.version == asset.version &&
                checksumsEqual(local.checksum, asset.checksum)
        if (matches) toSkip += asset else toFetch += asset
    }
    return DownloadPlan(
        toFetch = prioritizePlaylistDownloads(toFetch, playlist),
        toSkip = toSkip,
        neededBytes = toFetch.sumOf { it.fileSize.coerceAtLeast(0L) },
    )
}

/**
 * Playlist order first so the first clip can activate while later large MP4s
 * are still downloading.
 */
fun prioritizePlaylistDownloads(
    toFetch: List<ManifestAsset>,
    playlist: ManifestPlaylist?,
): List<ManifestAsset> {
    if (toFetch.isEmpty() || playlist == null || playlist.items.isEmpty()) return toFetch
    val byFilename = toFetch.groupBy { it.localFilename }
    val byId = toFetch.associateBy { it.id }
    val ordered = LinkedHashSet<ManifestAsset>()
    for (item in playlist.items) {
        byFilename[item.localFilename]?.forEach { ordered.add(it) }
        byId[item.mediaId]?.let { ordered.add(it) }
    }
    for (asset in toFetch) ordered.add(asset)
    return ordered.toList()
}

/** True when at least one playlist item resolves to a local file on disk. */
fun hasPlayableLocalPlaylistItem(manifest: ContentManifest, root: File): Boolean =
    resolvePlaylistItems(manifest.playlist, manifest.assets, root).isNotEmpty()

fun progressPercent(downloadedBytes: Long, neededBytes: Long): Int {
    if (neededBytes <= 0L) return 100
    val downloaded = downloadedBytes.coerceAtLeast(0L)
    if (downloaded >= neededBytes) return 100
    return ((downloaded * 100L) / neededBytes).toInt().coerceIn(0, 99)
}
