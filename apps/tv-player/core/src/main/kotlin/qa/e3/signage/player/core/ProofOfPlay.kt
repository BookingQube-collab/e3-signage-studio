package qa.e3.signage.player.core

import java.time.Instant
import java.util.UUID

data class OpenPlayback(
    val clientEventId: String,
    val campaignId: String?,
    val playlistId: String?,
    val mediaId: String,
    val mediaVersionId: String?,
    val startedAt: Instant,
)

fun newPlaybackEventId(): String = UUID.randomUUID().toString()

fun newBatchId(): String = UUID.randomUUID().toString()

fun startPlayback(
    item: ResolvedPlaylistItem,
    campaignId: String?,
    playlistId: String?,
    startedAt: Instant = Instant.now(),
): OpenPlayback = OpenPlayback(
    clientEventId = newPlaybackEventId(),
    campaignId = campaignId,
    playlistId = playlistId,
    mediaId = item.mediaId,
    mediaVersionId = item.mediaVersionId,
    startedAt = startedAt,
)

fun completePlayback(
    open: OpenPlayback,
    result: PlaybackResult,
    endedAt: Instant = Instant.now(),
): PlaybackLogEvent {
    val duration = (endedAt.toEpochMilli() - open.startedAt.toEpochMilli()).coerceAtLeast(0L)
    return PlaybackLogEvent(
        clientEventId = open.clientEventId,
        campaignId = open.campaignId,
        playlistId = open.playlistId,
        mediaId = open.mediaId,
        mediaVersionId = open.mediaVersionId,
        startedAt = toIsoDateTime(open.startedAt),
        endedAt = toIsoDateTime(endedAt),
        durationMs = duration.toInt().coerceAtLeast(0),
        result = result,
    )
}

fun assignBatchId(pending: List<StoredPlaybackEvent>, batchId: String = newBatchId()): List<StoredPlaybackEvent> {
    if (pending.isEmpty()) return emptyList()
    val existing = pending.mapNotNull { it.batchId }.toSet()
    val id = existing.singleOrNull() ?: batchId
    return pending.map { row ->
        if (row.batchId == id) row else row.copy(batchId = id)
    }
}

fun nextPlaybackBatch(
    pending: List<StoredPlaybackEvent>,
    max: Int = PLAYBACK_LOG_BATCH_MAX,
): List<StoredPlaybackEvent> {
    if (pending.isEmpty()) return emptyList()
    val firstId = pending.first().batchId
    val sameBatch = if (firstId != null) pending.filter { it.batchId == firstId } else pending
    return assignBatchId(sameBatch.take(max))
}

fun shouldRetainUploadedLog(uploadedAtMs: Long, nowMs: Long, retainMs: Long = UPLOADED_LOG_RETAIN_MS): Boolean =
    nowMs - uploadedAtMs <= retainMs

fun latestHeartbeatPayload(queued: List<QueuedUpload>, kind: String = QueuedUpload.KIND_HEARTBEAT): QueuedUpload? =
    queued.filter { it.kind == kind }.maxByOrNull { it.createdAt }
