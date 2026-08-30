package qa.e3.signage.player.core

/**
 * How often the foreground player checks `GET …/sync-status` while content is playing.
 * Idle / waiting / off-hours polls faster so publish and schedule edits land quickly.
 */
const val SYNC_STATUS_INTERVAL_MS = 15_000L
const val SYNC_STATUS_IDLE_INTERVAL_MS = 10_000L

fun nextSyncPollDelayMs(playing: Boolean): Long =
    if (playing) SYNC_STATUS_INTERVAL_MS else SYNC_STATUS_IDLE_INTERVAL_MS

/** Fetch the full manifest only on a version bump or an explicit CMS sync request. */
fun shouldFetchManifest(
    cloudManifestVersion: Int,
    localManifestVersion: Int,
    syncRequested: Boolean,
): Boolean = syncRequested || cloudManifestVersion > localManifestVersion

/**
 * Stable key for playlist order + duration + transition.
 * Used to refresh an ACTIVE package when Sync Now returns the same version
 * but the live manifest sequence changed (or cache was stale).
 */
fun playlistSequenceKey(playlist: ManifestPlaylist?): String {
    if (playlist == null) return ""
    return playlist.items.joinToString("|") { item ->
        val audio = item.audioLocalFilename?.takeIf { it.isNotBlank() }?.let { ":$it" }.orEmpty()
        "${item.mediaVersionId}:${item.durationSeconds}:${item.transition.trim().uppercase()}$audio"
    }
}

/** Stable key for schedule windows so Ongoing/date edits refresh without a version bump. */
fun scheduleWindowsKey(schedules: List<ManifestSchedule>): String =
    schedules.joinToString(";") { schedule ->
        listOf(
            schedule.campaignId,
            schedule.startAt.orEmpty(),
            schedule.endAt.orEmpty(),
            schedule.startTime,
            schedule.endTime,
            schedule.daysOfWeek.joinToString(","),
            schedule.timezone,
            schedule.priority.toString(),
            schedule.emergency.toString(),
        ).joinToString("|")
    }

/** True when cloud has a newer package and the device is still downloading/verifying it. */
fun isPreparingNewerPackage(
    cloudManifestVersion: Int,
    activeManifestVersion: Int,
    packageState: ContentPackageState?,
): Boolean {
    if (cloudManifestVersion <= activeManifestVersion) return false
    return when (packageState) {
        ContentPackageState.PENDING,
        ContentPackageState.DOWNLOADING,
        ContentPackageState.VERIFYING,
        ContentPackageState.READY,
        -> true
        else -> false
    }
}