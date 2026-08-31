package qa.e3.signage.player.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DecodeFailurePolicyTest {
    private fun video(id: String) = ResolvedPlaylistItem(
        mediaId = id,
        mediaVersionId = "v-$id",
        durationSeconds = 10.0,
        transition = "CUT",
        localFilename = "$id.mp4",
        kind = PlaylistItemKind.VIDEO,
        fileUri = "file:///tmp/$id.mp4",
    )

    private fun image(id: String) = ResolvedPlaylistItem(
        mediaId = id,
        mediaVersionId = "v-$id",
        durationSeconds = 8.0,
        transition = "CUT",
        localFilename = "$id.jpg",
        kind = PlaylistItemKind.IMAGE,
        fileUri = "file:///tmp/$id.jpg",
    )

    @Test
    fun singleFailedVideoMeansAllFailed() {
        val tracker = DecodeFailureTracker()
        val items = listOf(video("a"))
        tracker.recordFailure("a")
        assertTrue(tracker.allVideosFailed(items))
    }

    @Test
    fun waitsUntilEveryVideoFails() {
        val tracker = DecodeFailureTracker()
        val items = listOf(video("a"), video("b"), image("i"))
        tracker.recordFailure("a")
        assertFalse(tracker.allVideosFailed(items))
        tracker.recordFailure("b")
        assertTrue(tracker.allVideosFailed(items))
    }

    @Test
    fun successClearsThatId() {
        val tracker = DecodeFailureTracker()
        val items = listOf(video("a"), video("b"))
        tracker.recordFailure("a")
        tracker.recordFailure("b")
        assertTrue(tracker.allVideosFailed(items))
        tracker.recordSuccess("a")
        assertFalse(tracker.allVideosFailed(items))
    }

    @Test
    fun emptyOrImageOnlyNeverAllFailed() {
        val tracker = DecodeFailureTracker()
        assertFalse(tracker.allVideosFailed(emptyList()))
        tracker.recordFailure("ghost")
        assertFalse(tracker.allVideosFailed(listOf(image("i"))))
    }
}
