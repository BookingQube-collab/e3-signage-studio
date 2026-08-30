package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ScheduleEngineTest {
    private fun schedule(
        startAt: String? = "2026-08-01T00:00:00Z",
        endAt: String? = "2026-09-30T20:59:00Z",
        startTime: String = "12:00",
        endTime: String = "22:00",
        days: List<Int> = listOf(0, 1, 2, 3, 4, 5, 6),
        priority: Int = 50,
        emergency: Boolean = false,
        campaignId: String = "camp-a",
        timezone: String = "Asia/Qatar",
    ) = ManifestSchedule(
        campaignId = campaignId,
        startAt = startAt,
        endAt = endAt,
        startTime = startTime,
        endTime = endTime,
        daysOfWeek = days,
        timezone = timezone,
        priority = priority,
        emergency = emergency,
    )

    @Test
    fun playsInsideDailyWindowInQatar() {
        // 25 Aug 2026 12:00 Asia/Qatar = 09:00 UTC
        val noon = Instant.parse("2026-08-25T09:00:00Z")
        assertTrue(ScheduleEngine.isWindowOpen(schedule(), noon))
        val morning = Instant.parse("2026-08-25T07:00:00Z") // 10:00 Qatar
        assertFalse(ScheduleEngine.isWindowOpen(schedule(), morning))
    }

    @Test
    fun expiredRangeDropsOutWithoutCloud() {
        val now = Instant.parse("2026-10-01T09:00:00Z")
        assertFalse(ScheduleEngine.shouldPlay(listOf(schedule()), now))
    }

    @Test
    fun emptyScheduleListMeansAlwaysPlay() {
        assertTrue(ScheduleEngine.shouldPlay(emptyList(), Instant.parse("2026-08-25T09:00:00Z")))
    }

    @Test
    fun higherPriorityAndEmergencyWin() {
        val now = Instant.parse("2026-08-25T09:00:00Z")
        val normal = schedule(priority = 50, campaignId = "normal")
        val special = schedule(priority = 80, campaignId = "event")
        val emergency = schedule(priority = 80, emergency = true, campaignId = "alert", startAt = "2026-08-01T00:00:00Z")
        val winner = ScheduleEngine.selectActive(listOf(normal, special, emergency), now)
        assertEquals("alert", winner?.campaignId)
        val later = schedule(priority = 80, campaignId = "later", startAt = "2026-08-20T00:00:00Z")
        val earlier = schedule(priority = 80, campaignId = "earlier", startAt = "2026-08-01T00:00:00Z")
        assertEquals("later", ScheduleEngine.selectActive(listOf(earlier, later), now)?.campaignId)
    }

    @Test
    fun overnightWindowStaysOpen() {
        val window = schedule(startTime = "22:00", endTime = "02:00")
        val late = Instant.parse("2026-08-25T20:00:00Z") // 23:00 Qatar
        val early = Instant.parse("2026-08-25T22:30:00Z") // 01:30 Qatar next calendar day UTC
        assertTrue(ScheduleEngine.isWindowOpen(window, late))
        assertTrue(ScheduleEngine.isWindowOpen(window, early))
        val afternoon = Instant.parse("2026-08-25T10:00:00Z")
        assertFalse(ScheduleEngine.isWindowOpen(window, afternoon))
    }

    @Test
    fun weekdayFilterUsesSundayZero() {
        // 25 Aug 2026 is Tuesday = 2
        val tue = Instant.parse("2026-08-25T09:00:00Z")
        assertTrue(ScheduleEngine.isWindowOpen(schedule(days = listOf(2)), tue))
        assertFalse(ScheduleEngine.isWindowOpen(schedule(days = listOf(0, 6)), tue))
        assertNull(ScheduleEngine.selectActive(listOf(schedule(days = listOf(0))), tue))
        assertNotNull(ScheduleEngine.selectActive(listOf(schedule(days = listOf(2))), tue))
    }

    @Test
    fun nullDatesAreAlwaysOnIgnoringDailyHours() {
        val noon = Instant.parse("2026-08-25T09:00:00Z")
        val morning = Instant.parse("2026-08-25T07:00:00Z")
        val farFuture = Instant.parse("2028-01-01T09:00:00Z")
        val evergreen = schedule(startAt = null, endAt = null, campaignId = "loop")
        val blank = schedule(startAt = "", endAt = "", campaignId = "blank")
        val restrictedHours = schedule(
            startAt = null,
            endAt = null,
            startTime = "18:00",
            endTime = "22:00",
            days = listOf(1),
            campaignId = "always",
        )
        assertTrue(ScheduleEngine.isWindowOpen(evergreen, noon))
        assertTrue(ScheduleEngine.isWindowOpen(evergreen, morning))
        assertTrue(ScheduleEngine.isWindowOpen(evergreen, farFuture))
        assertTrue(ScheduleEngine.isWindowOpen(blank, noon))
        assertTrue(ScheduleEngine.isWindowOpen(restrictedHours, morning))
        assertEquals("loop", ScheduleEngine.selectActive(listOf(evergreen), noon)?.campaignId)
    }
}
