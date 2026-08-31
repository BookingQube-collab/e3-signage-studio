package qa.e3.signage.player.core

/**
 * Keep the branded waiting / download UI until media is actually on screen.
 * Leaving "Downloading…" for a blank navy ExoPlayer shutter is the 0.29 regression
 * on slow Wi‑Fi: package goes ACTIVE (or playLoop sets playing) before first frame.
 */
fun shouldHoldPlaybackWaiting(
    contentDisplaying: Boolean,
    downloadBusy: Boolean,
    downloadFailed: Boolean,
    alreadyWaiting: Boolean,
): Boolean {
    if (contentDisplaying) return false
    return alreadyWaiting || downloadBusy || downloadFailed
}
