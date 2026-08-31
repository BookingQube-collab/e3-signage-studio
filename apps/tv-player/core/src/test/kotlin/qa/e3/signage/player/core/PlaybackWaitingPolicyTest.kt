package qa.e3.signage.player.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackWaitingPolicyTest {
    @Test
    fun holdsWhileDownloadingBeforeFirstFrame() {
        assertTrue(
            shouldHoldPlaybackWaiting(
                contentDisplaying = false,
                downloadBusy = true,
                downloadFailed = false,
                alreadyWaiting = true,
            ),
        )
    }

    @Test
    fun holdsWhileStuckAtZeroPercentWaiting() {
        assertTrue(
            shouldHoldPlaybackWaiting(
                contentDisplaying = false,
                downloadBusy = true,
                downloadFailed = false,
                alreadyWaiting = false,
            ),
        )
    }

    @Test
    fun holdsUntilFirstFrameEvenAfterPackageActive() {
        assertTrue(
            shouldHoldPlaybackWaiting(
                contentDisplaying = false,
                downloadBusy = false,
                downloadFailed = false,
                alreadyWaiting = true,
            ),
        )
    }

    @Test
    fun releasesOnlyWhenContentIsDisplaying() {
        assertFalse(
            shouldHoldPlaybackWaiting(
                contentDisplaying = true,
                downloadBusy = true,
                downloadFailed = false,
                alreadyWaiting = true,
            ),
        )
    }

    @Test
    fun showsFailedInsteadOfBlank() {
        assertTrue(
            shouldHoldPlaybackWaiting(
                contentDisplaying = false,
                downloadBusy = false,
                downloadFailed = true,
                alreadyWaiting = false,
            ),
        )
    }

    @Test
    fun noHoldBetweenClipsWhenAlreadyDisplaying() {
        assertFalse(
            shouldHoldPlaybackWaiting(
                contentDisplaying = true,
                downloadBusy = false,
                downloadFailed = false,
                alreadyWaiting = false,
            ),
        )
    }
}
