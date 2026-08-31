package qa.e3.signage.player.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import qa.e3.signage.player.core.SyncProgress
import qa.e3.signage.player.core.SyncProgressPhase
import qa.e3.signage.player.core.formatSyncFileLabel
import qa.e3.signage.player.core.syncProgressPercent

/**
 * Live package download/verify progress for the waiting UI.
 * Updated from [PackageSyncCoordinator] on the sync worker thread.
 */
class SyncProgressStore {
    private val _state = MutableStateFlow(SyncProgress())
    val state: StateFlow<SyncProgress> = _state.asStateFlow()

    fun clear() {
        _state.value = SyncProgress(updatedAtMs = System.currentTimeMillis())
    }

    fun beginDownload(filesTotal: Int, bytesTotal: Long) {
        _state.value = SyncProgress(
            phase = SyncProgressPhase.DOWNLOADING,
            percent = if (filesTotal == 0 || bytesTotal <= 0L) 0 else 0,
            filesDone = 0,
            filesTotal = filesTotal,
            bytesDownloaded = 0L,
            bytesTotal = bytesTotal,
            updatedAtMs = System.currentTimeMillis(),
        )
    }

    fun onFileProgress(
        filesDone: Int,
        filesTotal: Int,
        currentFile: String?,
        bytesDownloaded: Long,
        bytesTotal: Long,
    ) {
        val index = (filesDone + 1).coerceAtMost(filesTotal.coerceAtLeast(1))
        _state.value = SyncProgress(
            phase = SyncProgressPhase.DOWNLOADING,
            percent = syncProgressPercent(bytesDownloaded, bytesTotal),
            filesDone = filesDone,
            filesTotal = filesTotal,
            currentFile = formatSyncFileLabel(index, filesTotal, currentFile),
            bytesDownloaded = bytesDownloaded,
            bytesTotal = bytesTotal,
            updatedAtMs = System.currentTimeMillis(),
        )
    }

    fun beginVerifying(filesTotal: Int) {
        _state.value = SyncProgress(
            phase = SyncProgressPhase.VERIFYING,
            percent = 100,
            filesDone = filesTotal,
            filesTotal = filesTotal,
            currentFile = null,
            bytesDownloaded = _state.value.bytesTotal,
            bytesTotal = _state.value.bytesTotal,
            updatedAtMs = System.currentTimeMillis(),
        )
    }

    fun fail(error: String?, filesDone: Int = _state.value.filesDone, filesTotal: Int = _state.value.filesTotal) {
        _state.value = SyncProgress(
            phase = SyncProgressPhase.FAILED,
            percent = _state.value.percent,
            filesDone = filesDone,
            filesTotal = filesTotal,
            currentFile = _state.value.currentFile,
            bytesDownloaded = _state.value.bytesDownloaded,
            bytesTotal = _state.value.bytesTotal,
            error = error?.takeIf { it.isNotBlank() } ?: "Download failed. Tap retry or wait for Sync Now.",
            updatedAtMs = System.currentTimeMillis(),
        )
    }
}
