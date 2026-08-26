package qa.e3.signage.player.core

import java.io.File

/** Free space below this is treated as “nearly full” for unused-file cleanup. */
const val LOW_STORAGE_BYTES: Long = 256L * 1024L * 1024L

data class StoragePruneResult(
    val deleted: List<File>,
    val kept: List<File>,
)

fun isLowStorage(availableBytes: Long, watermarkBytes: Long = LOW_STORAGE_BYTES): Boolean =
    availableBytes in 0 until watermarkBytes

fun keepMediaFiles(root: File, assets: List<ManifestAsset>): Set<File> =
    assets.map { expectedMediaFile(root, it).canonicalFile }.toSet()

/**
 * Unused cache is always eligible. Media and temp files that are not in the
 * ACTIVE/READY keep set are removed only when the device is nearly full.
 * Keep-set files are never deleted.
 */
fun planStoragePrune(
    root: File,
    keepAssets: List<ManifestAsset>,
    availableBytes: Long,
    watermarkBytes: Long = LOW_STORAGE_BYTES,
): List<File> {
    val keep = keepMediaFiles(root, keepAssets)
    val candidates = mutableListOf<File>()
    collectFiles(File(root, "cache"), candidates)
    if (isLowStorage(availableBytes, watermarkBytes)) {
        collectFiles(File(root, "temp"), candidates)
        collectFiles(File(root, "media/image"), candidates)
        collectFiles(File(root, "media/video"), candidates)
    }
    return candidates
        .distinctBy { it.canonicalPath }
        .filter { it.canonicalFile !in keep }
}

fun pruneUnusedStorage(
    root: File,
    keepAssets: List<ManifestAsset>,
    availableBytes: Long,
    watermarkBytes: Long = LOW_STORAGE_BYTES,
): StoragePruneResult {
    val keep = keepMediaFiles(root, keepAssets).filter { it.isFile }
    val deleted = mutableListOf<File>()
    for (file in planStoragePrune(root, keepAssets, availableBytes, watermarkBytes)) {
        if (!file.isFile) continue
        if (file.delete() || !file.exists()) deleted += file
    }
    return StoragePruneResult(deleted = deleted, kept = keep)
}

private fun collectFiles(dir: File, into: MutableList<File>) {
    if (!dir.isDirectory) return
    dir.walkTopDown().filter { it.isFile }.forEach { into += it }
}
