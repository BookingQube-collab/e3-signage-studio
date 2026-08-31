package qa.e3.signage.player.core

/**
 * Keep the branded waiting / download UI until media is actually on screen.
 *
 * 0.29 cleared Waiting as soon as the package went ACTIVE (playing=true) → blank navy.
 * 0.30 held Waiting until ExoPlayer STATE_READY, but READY often fires *before* the
 * PlayerView surface is attached (prepare in DisposableEffect, bind in AndroidView) →
 * still blank after download completes. Hold until [contentDisplaying] (first rendered
 * frame / decoded image), never the bare player canvas.
 *
 * [downloadBusy], [downloadFailed], and [alreadyWaiting] are retained for call-site
 * clarity / future copy selection; they must not open a hole onto an empty SurfaceView.
 */
@Suppress("UNUSED_PARAMETER")
fun shouldHoldPlaybackWaiting(
    contentDisplaying: Boolean,
    downloadBusy: Boolean = false,
    downloadFailed: Boolean = false,
    alreadyWaiting: Boolean = false,
): Boolean = !contentDisplaying
