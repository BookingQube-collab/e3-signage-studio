package qa.e3.signage.player.core

/** How long a media download may sit with zero new bytes before it is treated as stalled. */
const val DOWNLOAD_STALL_TIMEOUT_MS = 3 * 60_000L

enum class SyncProgressPhase {
    IDLE,
    DOWNLOADING,
    VERIFYING,
    FAILED,
}

data class SyncProgress(
    val phase: SyncProgressPhase = SyncProgressPhase.IDLE,
    val percent: Int = 0,
    val filesDone: Int = 0,
    val filesTotal: Int = 0,
    val currentFile: String? = null,
    val bytesDownloaded: Long = 0L,
    val bytesTotal: Long = 0L,
    val error: String? = null,
    val updatedAtMs: Long = 0L,
) {
    val isBusy: Boolean
        get() = phase == SyncProgressPhase.DOWNLOADING || phase == SyncProgressPhase.VERIFYING

    val isFailed: Boolean
        get() = phase == SyncProgressPhase.FAILED
}

fun syncProgressPercent(downloadedBytes: Long, neededBytes: Long): Int =
    progressPercent(downloadedBytes, neededBytes)

fun formatSyncFileLabel(indexOneBased: Int, total: Int, filename: String?): String {
    val name = filename?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "file"
    return if (total > 0) "$indexOneBased/$total · $name" else name
}

fun downloadStallMessage(timeoutMs: Long = DOWNLOAD_STALL_TIMEOUT_MS): String {
    val minutes = (timeoutMs / 60_000L).coerceAtLeast(1L)
    return "Download stalled — no data for $minutes min. Check Wi‑Fi and retry."
}
