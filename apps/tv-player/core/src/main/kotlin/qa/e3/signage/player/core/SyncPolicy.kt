package qa.e3.signage.player.core

/** Fetch the full manifest only on a version bump or an explicit CMS sync request. */
fun shouldFetchManifest(
    cloudManifestVersion: Int,
    localManifestVersion: Int,
    syncRequested: Boolean,
): Boolean = syncRequested || cloudManifestVersion > localManifestVersion
