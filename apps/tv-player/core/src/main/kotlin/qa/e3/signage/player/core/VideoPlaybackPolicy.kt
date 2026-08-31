package qa.e3.signage.player.core

/**
 * How long to wait for the first decoder frame / READY before treating a clip as failed.
 * Signage SoCs can stall forever on a second concurrent ExoPlayer; fail-fast and skip.
 */
const val VIDEO_READY_TIMEOUT_MS = 20_000L

/**
 * Absolute safety net so a hung decoder cannot block the playlist forever.
 * Normal clips end via STATE_ENDED; this is not used to trim playback.
 */
const val VIDEO_PLAYBACK_SAFETY_MS = 3L * 60L * 60L * 1000L

/**
 * Playlist `durationSeconds` is for images (and proof-of-play hints). Videos must play
 * to natural end — capping at the CMS default (often 10s) made single clips "play fast"
 * and multi-clip playlists thrash the decoder on every premature advance.
 */
fun videoPlaybackSafetyTimeoutMs(durationSeconds: Double): Long {
    val hinted = (durationSeconds * 1000.0).toLong().coerceAtLeast(0L)
    return maxOf(VIDEO_PLAYBACK_SAFETY_MS, hinted + 60_000L)
}
