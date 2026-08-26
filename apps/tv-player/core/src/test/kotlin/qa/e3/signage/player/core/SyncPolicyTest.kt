package qa.e3.signage.player.core

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
}
