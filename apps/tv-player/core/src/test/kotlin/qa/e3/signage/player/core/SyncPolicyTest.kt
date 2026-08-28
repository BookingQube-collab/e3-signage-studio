package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncPolicyTest {
    @Test
    fun unchangedVersionDoesNotFetchManifest() {
        assertFalse(shouldFetchManifest(cloudManifestVersion = 21, localManifestVersion = 21, syncRequested = false))
        assertTrue(shouldFetchManifest(cloudManifestVersion = 22, localManifestVersion = 21, syncRequested = false))
        assertTrue(shouldFetchManifest(cloudManifestVersion = 21, localManifestVersion = 21, syncRequested = true))
    }

    @Test
    fun playlistSequenceKeyTracksOrderAndTransition() {
        val playlist = ManifestPlaylist(
            id = "pl",
            version = 1,
            loop = true,
            items = listOf(
                ManifestPlaylistItem("m1", "v1", 10.0, "FADE", "a.jpg"),
                ManifestPlaylistItem("m2", "v2", 12.0, "SLIDE", "b.jpg"),
            ),
        )
        assertEquals("v1:10.0:FADE|v2:12.0:SLIDE", playlistSequenceKey(playlist))
        assertEquals(
            "v2:12.0:SLIDE|v1:10.0:FADE",
            playlistSequenceKey(playlist.copy(items = playlist.items.reversed())),
        )
    }

    @Test
    fun preparingNewerPackageShowsLoadingPath() {
        assertTrue(
            isPreparingNewerPackage(
                cloudManifestVersion = 5,
                activeManifestVersion = 4,
                packageState = ContentPackageState.DOWNLOADING,
            ),
        )
        assertFalse(
            isPreparingNewerPackage(
                cloudManifestVersion = 4,
                activeManifestVersion = 4,
                packageState = ContentPackageState.DOWNLOADING,
            ),
        )
        assertFalse(
            isPreparingNewerPackage(
                cloudManifestVersion = 5,
                activeManifestVersion = 4,
                packageState = ContentPackageState.ACTIVE,
            ),
        )
        assertEquals(15_000L, SYNC_STATUS_INTERVAL_MS)
    }
}
