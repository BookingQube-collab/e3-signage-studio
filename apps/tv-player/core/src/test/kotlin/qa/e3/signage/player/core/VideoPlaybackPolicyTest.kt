package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VideoPlaybackPolicyTest {
    @Test
    fun shortPlaylistDurationDoesNotCapVideoSafety() {
        // CMS defaults video items to ~10s — that must not become the wait cap.
        val safety = videoPlaybackSafetyTimeoutMs(10.0)
        assertTrue(safety >= VIDEO_PLAYBACK_SAFETY_MS)
        assertTrue(safety > 10_000L)
    }

    @Test
    fun readyTimeoutIsShortEnoughToSkipStuckDecoder() {
        assertEquals(20_000L, VIDEO_READY_TIMEOUT_MS)
    }
}
