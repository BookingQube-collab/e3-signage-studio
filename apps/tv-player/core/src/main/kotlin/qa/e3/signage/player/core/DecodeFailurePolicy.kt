package qa.e3.signage.player.core

/**
 * Tracks video decode failures across one playlist pass so we can stop thrashing
 * PLAYBACK ISSUE when every clip is unplayable on this SoC.
 */
class DecodeFailureTracker {
    private val failedVideoIds = linkedSetOf<String>()

    fun recordSuccess(mediaId: String) {
        failedVideoIds.remove(mediaId)
    }

    fun recordFailure(mediaId: String) {
        failedVideoIds.add(mediaId)
    }

    fun clear() {
        failedVideoIds.clear()
    }

    /**
     * True when every VIDEO item in [playlist] has failed at least once this pass
     * (images are ignored — they do not need a video decoder).
     */
    fun allVideosFailed(playlist: List<ResolvedPlaylistItem>): Boolean {
        val videoIds = playlist.asSequence()
            .filter { it.kind == PlaylistItemKind.VIDEO }
            .map { it.mediaId }
            .toSet()
        if (videoIds.isEmpty()) return false
        return failedVideoIds.containsAll(videoIds)
    }

    fun failedCount(): Int = failedVideoIds.size
}

/** How long to hold the stable "re-encode as H.264" screen before retrying the loop. */
const val ALL_DECODE_FAILED_HOLD_MS = 60_000L
