package qa.e3.signage.player.core

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
        toFetch = toFetch,
        toSkip = toSkip,
        neededBytes = toFetch.sumOf { it.fileSize.coerceAtLeast(0L) },
    )
}

fun progressPercent(downloadedBytes: Long, neededBytes: Long): Int {
    if (neededBytes <= 0L) return 100
    val downloaded = downloadedBytes.coerceAtLeast(0L)
    if (downloaded >= neededBytes) return 100
    return ((downloaded * 100L) / neededBytes).toInt().coerceIn(0, 99)
}
