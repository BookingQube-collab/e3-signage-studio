package qa.e3.signage.player.core

data class IntRect(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
)

sealed class ZoneSource {
    data class Playlist(val zoneId: String) : ZoneSource()
    data class StaticFile(val fileUri: String, val kind: PlaylistItemKind, val fit: FitMode) : ZoneSource()
    data object Clock : ZoneSource()
    data object Date : ZoneSource()
    data object Empty : ZoneSource()
}

data class PlannedZone(
    val id: String,
    val rect: IntRect,
    val fit: FitMode,
    val source: ZoneSource,
)

data class ZonePlan(
    val layoutWidth: Int,
    val layoutHeight: Int,
    val background: String,
    val zones: List<PlannedZone>,
)

fun effectiveLayout(manifest: ContentManifest): ManifestLayout {
    val layout = manifest.layouts.firstOrNull()
    val zones = layout?.zones.orEmpty()
    if (layout != null && zones.isNotEmpty()) return layout
    return ManifestLayout(
        id = layout?.id ?: "full",
        width = layout?.width?.takeIf { it > 0 } ?: 1920,
        height = layout?.height?.takeIf { it > 0 } ?: 1080,
        background = layout?.background ?: "#000000",
        zones = listOf(
            ManifestZone(
                id = "full",
                type = ZoneKind.VIDEO,
                x = 0,
                y = 0,
                width = layout?.width?.takeIf { it > 0 } ?: 1920,
                height = layout?.height?.takeIf { it > 0 } ?: 1080,
                fit = FitMode.CONTAIN,
                contentRef = null,
            ),
        ),
    )
}

fun scaleZone(zone: ManifestZone, layoutWidth: Int, layoutHeight: Int, screenWidth: Int, screenHeight: Int): IntRect {
    val lw = layoutWidth.coerceAtLeast(1)
    val lh = layoutHeight.coerceAtLeast(1)
    return IntRect(
        x = zone.x * screenWidth / lw,
        y = zone.y * screenHeight / lh,
        width = (zone.width * screenWidth / lw).coerceAtLeast(1),
        height = (zone.height * screenHeight / lh).coerceAtLeast(1),
    )
}

fun planZones(
    manifest: ContentManifest,
    root: java.io.File,
    screenWidth: Int,
    screenHeight: Int,
): ZonePlan {
    val layout = effectiveLayout(manifest)
    val byFile = manifest.assets.associateBy { it.localFilename }
    val byId = manifest.assets.associateBy { it.id }
    val hasPlaylist = manifest.playlist?.items?.isNotEmpty() == true
    val zones = layout.zones.map { zone ->
        PlannedZone(
            id = zone.id,
            rect = scaleZone(zone, layout.width, layout.height, screenWidth, screenHeight),
            fit = zone.fit,
            source = sourceFor(zone, hasPlaylist, byFile, byId, root),
        )
    }
    return ZonePlan(layout.width, layout.height, layout.background, zones)
}

/** Layout campaigns publish zone files with no playlist. Those still have something to show. */
fun hasPlayableLayoutContent(plan: ZonePlan): Boolean =
    plan.zones.any { zone ->
        when (zone.source) {
            is ZoneSource.StaticFile, ZoneSource.Clock, ZoneSource.Date -> true
            else -> false
        }
    }

fun exoResizeMode(fit: FitMode): String = when (fit) {
    FitMode.STRETCH -> "FILL"
    FitMode.COVER, FitMode.FILL -> "ZOOM"
    FitMode.FIT, FitMode.CONTAIN -> "FIT"
}

private fun sourceFor(
    zone: ManifestZone,
    hasPlaylist: Boolean,
    byFile: Map<String, ManifestAsset>,
    byId: Map<String, ManifestAsset>,
    root: java.io.File,
): ZoneSource {
    when (zone.type) {
        ZoneKind.CLOCK -> return ZoneSource.Clock
        ZoneKind.DATE -> return ZoneSource.Date
        ZoneKind.TEXT -> if (zone.contentRef.isNullOrBlank()) return ZoneSource.Empty
        else -> Unit
    }
    val ref = zone.contentRef
    if (!ref.isNullOrBlank()) {
        val asset = byFile[ref] ?: byId[ref]
        val type = asset?.type ?: if (zone.type == ZoneKind.VIDEO) MediaKind.VIDEO else MediaKind.IMAGE
        val file = resolveLocalMedia(root, type, asset?.localFilename ?: ref)
        val uri = file?.let { runCatching { localFileUri(it) }.getOrNull() }
        if (uri != null) {
            val kind = if (type == MediaKind.VIDEO) PlaylistItemKind.VIDEO else PlaylistItemKind.IMAGE
            return ZoneSource.StaticFile(uri, kind, zone.fit)
        }
        return ZoneSource.Empty
    }
    val playlistTypes = setOf(ZoneKind.VIDEO, ZoneKind.SLIDESHOW, ZoneKind.IMAGE)
    return if (hasPlaylist && zone.type in playlistTypes) ZoneSource.Playlist(zone.id) else ZoneSource.Empty
}
