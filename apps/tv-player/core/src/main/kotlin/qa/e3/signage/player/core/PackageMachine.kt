package qa.e3.signage.player.core

val PACKAGE_TRANSITIONS: Map<ContentPackageState, Set<ContentPackageState>> = mapOf(
    ContentPackageState.PENDING to setOf(ContentPackageState.DOWNLOADING, ContentPackageState.FAILED),
    ContentPackageState.DOWNLOADING to setOf(
        ContentPackageState.VERIFYING,
        ContentPackageState.FAILED,
        ContentPackageState.DOWNLOADING,
    ),
    ContentPackageState.VERIFYING to setOf(ContentPackageState.READY, ContentPackageState.FAILED),
    ContentPackageState.READY to setOf(ContentPackageState.ACTIVE, ContentPackageState.FAILED),
    ContentPackageState.ACTIVE to setOf(ContentPackageState.FAILED),
    ContentPackageState.FAILED to setOf(ContentPackageState.PENDING, ContentPackageState.DOWNLOADING),
)

fun canTransitionPackage(from: ContentPackageState, to: ContentPackageState): Boolean {
    if (from == to) return true
    return PACKAGE_TRANSITIONS[from]?.contains(to) == true
}

fun canBecomeActive(state: ContentPackageState): Boolean =
    state == ContentPackageState.READY

data class PackageSnapshot(
    val manifestVersion: Int,
    val state: ContentPackageState,
    val manifestPath: String?,
)

data class SwitchPlan(
    val active: PackageSnapshot,
    val previous: PackageSnapshot?,
)

fun selectPlaybackPackage(packages: List<PackageSnapshot>): PackageSnapshot? =
    packages.firstOrNull { it.state == ContentPackageState.ACTIVE }

fun planSwitch(previousActive: PackageSnapshot?, ready: PackageSnapshot): SwitchPlan {
    require(ready.state != ContentPackageState.FAILED) { "FAILED packages cannot become ACTIVE." }
    require(canBecomeActive(ready.state)) { "Only READY packages can become ACTIVE." }
    val retained = previousActive?.takeIf { it.manifestVersion != ready.manifestVersion }
    return SwitchPlan(
        active = ready.copy(state = ContentPackageState.ACTIVE),
        previous = retained?.copy(state = ContentPackageState.READY),
    )
}
