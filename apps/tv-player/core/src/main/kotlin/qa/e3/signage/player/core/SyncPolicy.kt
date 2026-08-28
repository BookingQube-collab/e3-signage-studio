package qa.e3.signage.player.core

/**
 * How often the foreground player checks `GET …/sync-status`.
 * Always-on TVs can afford a light poll; campaign publish should reach the screen in seconds.
 */
const val SYNC_STATUS_INTERVAL_MS = 15_000L

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
        "${item.mediaVersionId}:${item.durationSeconds}:${item.transition.trim().uppercase()}"
    }
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