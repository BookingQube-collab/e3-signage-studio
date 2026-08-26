package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class PackageMachineTest {
    @Test
    fun failedPackageNeverSelectedAsActive() {
        val packages = listOf(
            PackageSnapshot(3, ContentPackageState.ACTIVE, "v3.json"),
            PackageSnapshot(4, ContentPackageState.FAILED, "v4.json"),
        )
        val playing = selectPlaybackPackage(packages)
        assertEquals(3, playing?.manifestVersion)
        assertEquals(ContentPackageState.ACTIVE, playing?.state)
        assertNull(selectPlaybackPackage(listOf(PackageSnapshot(4, ContentPackageState.FAILED, "v4.json"))))
        assertFalse(canBecomeActive(ContentPackageState.FAILED))
        assertFalse(canTransitionPackage(ContentPackageState.FAILED, ContentPackageState.ACTIVE))
        assertFalse(canTransitionPackage(ContentPackageState.DOWNLOADING, ContentPackageState.ACTIVE))
        assertTrue(canTransitionPackage(ContentPackageState.READY, ContentPackageState.ACTIVE))
    }

    @Test(expected = IllegalArgumentException::class)
    fun failedCannotBeSwitchedToActive() {
        planSwitch(null, PackageSnapshot(4, ContentPackageState.FAILED, "v4.json"))
    }

    @Test
    fun switchIsAtomicActiveOnlyAfterReadyPreviousRetained() {
        val dir = createTempDirectory("e3-switch").toFile()
        val v3 = writeVersionedManifest(dir, 3, """{"manifestVersion":3}""")
        pointActiveManifest(dir, v3)
        val v4 = writeVersionedManifest(dir, 4, """{"manifestVersion":4}""")
        assertTrue(File(dir, "active.json").readText().contains("3"))

        val previous = PackageSnapshot(3, ContentPackageState.ACTIVE, v3.path)
        val ready = PackageSnapshot(4, ContentPackageState.READY, v4.path)
        val plan = planSwitch(previous, ready)
        assertEquals(ContentPackageState.ACTIVE, plan.active.state)
        assertEquals(4, plan.active.manifestVersion)
        assertEquals(3, plan.previous?.manifestVersion)
        assertEquals(ContentPackageState.READY, plan.previous?.state)
        assertTrue(File(dir, "active.json").readText().contains("3"))

        commitActiveSwitch(dir, ready, v4)
        assertTrue(File(dir, "active.json").readText().contains("4"))
        assertTrue(v3.isFile)
    }

    @Test(expected = IllegalArgumentException::class)
    fun downloadingPackageCannotPointActive() {
        val dir = createTempDirectory("e3-partial").toFile()
        val v4 = writeVersionedManifest(dir, 4, """{"manifestVersion":4}""")
        commitActiveSwitch(dir, PackageSnapshot(4, ContentPackageState.DOWNLOADING, v4.path), v4)
    }
}
