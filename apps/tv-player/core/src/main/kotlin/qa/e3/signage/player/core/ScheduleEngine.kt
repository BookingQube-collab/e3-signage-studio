package qa.e3.signage.player.core

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeParseException

/**
 * Local schedule evaluation. Higher numeric priority wins. On a tie: emergency,
 * then later startAt, then campaign id. Expired windows drop out with no cloud call.
 */
object ScheduleEngine {
    fun isWindowOpen(schedule: ManifestSchedule, now: Instant = Instant.now()): Boolean {
        val start = parseInstant(schedule.startAt) ?: return false
        val end = parseInstant(schedule.endAt) ?: return false
        if (now.isBefore(start) || now.isAfter(end)) return false
        val zone = zoneId(schedule.timezone)
        val local = ZonedDateTime.ofInstant(now, zone)
        val days = schedule.daysOfWeek.ifEmpty { listOf(0, 1, 2, 3, 4, 5, 6) }
        val jsDow = local.dayOfWeek.value % 7
        if (jsDow !in days) return false
        val startMin = minutesOfDay(schedule.startTime)
        val endMin = minutesOfDay(schedule.endTime)
        val nowMin = local.hour * 60 + local.minute
        if (startMin == endMin) return true
        return if (startMin < endMin) {
            nowMin in startMin until endMin
        } else {
            nowMin >= startMin || nowMin < endMin
        }
    }

    fun selectActive(schedules: List<ManifestSchedule>, now: Instant = Instant.now()): ManifestSchedule? {
        if (schedules.isEmpty()) return null
        return schedules
            .filter { isWindowOpen(it, now) }
            .maxWithOrNull(
                compareBy<ManifestSchedule> { it.priority }
                    .thenBy { it.emergency }
                    .thenBy { it.startAt }
                    .thenBy { it.campaignId },
            )
    }

    fun shouldPlay(schedules: List<ManifestSchedule>, now: Instant = Instant.now()): Boolean {
        if (schedules.isEmpty()) return true
        return selectActive(schedules, now) != null
    }

    private fun zoneId(name: String): ZoneId =
        runCatching { ZoneId.of(name) }.getOrElse { ZoneId.of("UTC") }

    private fun parseInstant(raw: String): Instant? {
        return try {
            Instant.parse(raw)
        } catch (_: DateTimeParseException) {
            try {
                Instant.parse(raw.replace(" ", "T"))
            } catch (_: DateTimeParseException) {
                null
            }
        }
    }

    private fun minutesOfDay(hhmm: String): Int {
        val parts = hhmm.trim().split(':')
        val hour = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 0
        val minute = parts.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 0
        return hour * 60 + minute
    }
}
