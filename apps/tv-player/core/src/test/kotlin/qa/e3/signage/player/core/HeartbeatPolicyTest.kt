package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HeartbeatPolicyTest {
    @Test
    fun firstHeartbeatIsAlwaysDue() {
        assertTrue(heartbeatDue(null, 1_000L))
    }

    @Test
    fun waitsTwoMinutesBetweenHeartbeats() {
        val sent = 10_000L
        assertFalse(heartbeatDue(sent, sent + 119_999L))
        assertTrue(heartbeatDue(sent, sent + HEARTBEAT_INTERVAL_MS))
    }

    @Test
    fun idlePlayerReportsWaitingAndReady() {
        assertEquals(DeviceSyncState.WAITING, syncStateForPackage(null))
        assertEquals(ScreenOperationalStatus.READY, operationalStatusForPackage(null))
        assertEquals(0, syncProgressForPackage(null))
    }

    @Test
    fun activePackageMapsToReadyOperationalAndActiveSync() {
        assertEquals(DeviceSyncState.ACTIVE, syncStateForPackage(ContentPackageState.ACTIVE))
        assertEquals(ScreenOperationalStatus.READY, operationalStatusForPackage(ContentPackageState.ACTIVE))
        assertEquals(100, syncProgressForPackage(ContentPackageState.ACTIVE))
    }

    @Test
    fun downloadingMapsToSyncingStates() {
        assertEquals(DeviceSyncState.DOWNLOADING, syncStateForPackage(ContentPackageState.DOWNLOADING))
        assertEquals(ScreenOperationalStatus.DOWNLOADING, operationalStatusForPackage(ContentPackageState.DOWNLOADING))
    }

    @Test
    fun isoDatetimeHasNoFractionalSeconds() {
        val iso = toIsoDateTime()
        assertTrue(iso.matches(Regex("""\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z""")))
    }
}
