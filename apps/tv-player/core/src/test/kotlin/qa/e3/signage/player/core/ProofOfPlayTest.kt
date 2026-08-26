package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ProofOfPlayTest {
    private fun item() = ResolvedPlaylistItem(
        mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        mediaVersionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        durationSeconds = 10.0,
        transition = "CUT",
        localFilename = "clip.mp4",
        kind = PlaylistItemKind.VIDEO,
        fileUri = "file:///tmp/clip.mp4",
    )

    @Test
    fun completedPlayHasDurationAndSameEventId() {
        val started = Instant.parse("2026-08-26T13:00:00Z")
        val open = startPlayback(item(), campaignId = null, playlistId = "p1", startedAt = started)
        val event = completePlayback(open, PlaybackResult.COMPLETED, Instant.parse("2026-08-26T13:00:10Z"))
        assertEquals(open.clientEventId, event.clientEventId)
        assertEquals(10_000, event.durationMs)
        assertEquals(PlaybackResult.COMPLETED, event.result)
        assertEquals("2026-08-26T13:00:00Z", event.startedAt)
        assertEquals("2026-08-26T13:00:10Z", event.endedAt)
    }

    @Test
    fun interruptedPlayKeepsOriginalStart() {
        val open = startPlayback(item(), null, null, Instant.parse("2026-08-26T13:00:00Z"))
        val event = completePlayback(open, PlaybackResult.INTERRUPTED, Instant.parse("2026-08-26T13:00:03Z"))
        assertEquals(PlaybackResult.INTERRUPTED, event.result)
        assertEquals(3_000, event.durationMs)
    }

    @Test
    fun batchReusesExistingBatchIdOnRetry() {
        val event = completePlayback(
            startPlayback(item(), null, null, Instant.parse("2026-08-26T13:00:00Z")),
            PlaybackResult.COMPLETED,
            Instant.parse("2026-08-26T13:00:01Z"),
        )
        val first = nextPlaybackBatch(listOf(StoredPlaybackEvent(event)))
        val retry = nextPlaybackBatch(first)
        assertEquals(1, first.size)
        assertEquals(first[0].batchId, retry[0].batchId)
        assertNotNull(first[0].batchId)
    }

    @Test
    fun latestHeartbeatWinsWhenQueuedOffline() {
        val older = QueuedUpload("1", QueuedUpload.KIND_HEARTBEAT, "{}", createdAt = 1)
        val newer = QueuedUpload("2", QueuedUpload.KIND_HEARTBEAT, "{\"v\":2}", createdAt = 9)
        val other = QueuedUpload("3", QueuedUpload.KIND_PLAYBACK, "{}", createdAt = 99)
        assertEquals("2", latestHeartbeatPayload(listOf(older, newer, other))?.id)
    }

    @Test
    fun uploadedLogsExpireAfterSevenDays() {
        val now = 10_000_000L
        assertTrue(shouldRetainUploadedLog(now - 3L * 24 * 60 * 60 * 1000, now))
        assertFalse(shouldRetainUploadedLog(now - UPLOADED_LOG_RETAIN_MS - 1, now))
    }
}
