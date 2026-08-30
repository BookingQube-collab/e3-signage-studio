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

/**
 * Resolve the layout to play. When the package has no zones (playlist-only), or a single
 * full-bleed zone with an explicit screen canvas, use the CMS oriented canvas so media
 * max-contains into the mount (portrait 1080×1920 / landscape 1920×1080) instead of a
 * mismatched stamp. Authored multi-zone layouts keep their geometry.
 */
fun effectiveLayout(
    manifest: ContentManifest,
    canvasWidth: Int? = manifest.width,
    canvasHeight: Int? = manifest.height,
): ManifestLayout {
    val orientation = DisplayOrientation.normalize(
        manifest.orientation.takeIf { it.isNotBlank() }
            ?: if ((manifest.height ?: 0) > (manifest.width ?: 0)) {
                DisplayOrientation.PORTRAIT
            } else {
                DisplayOrientation.LANDSCAPE
            },
    )
    val layout = manifest.layouts.firstOrNull()
    val zones = layout?.zones.orEmpty()
    val explicitCanvas = canvasWidth != null && canvasHeight != null && canvasWidth > 0 && canvasHeight > 0
    val canvas = when {
        explicitCanvas -> DisplayOrientation.orientedCanvasSize(canvasWidth!!, canvasHeight!!, orientation)
        layout != null && layout.width > 0 && layout.height > 0 ->
            OrientedCanvasSize(layout.width, layout.height)
        else -> DisplayOrientation.orientedCanvasSize(
            width = if (DisplayOrientation.isPortrait(orientation)) 1080 else 1920,
            height = if (DisplayOrientation.isPortrait(orientation)) 1920 else 1080,
            orientation = orientation,
        )
    }
    val cw = canvas.widthPx
    val ch = canvas.heightPx

    if (layout != null && zones.isNotEmpty()) {
        val shouldRemapFullBleed =
            explicitCanvas &&
                zones.size == 1 &&
                isFullBleedZone(zones[0], layout.width, layout.height) &&
                (layout.width != cw || layout.height != ch)
        if (shouldRemapFullBleed) {
            val zone = zones[0]
            return ManifestLayout(
                id = layout.id,
                width = cw,
                height = ch,
                background = layout.background,
                zones = listOf(zone.copy(x = 0, y = 0, width = cw, height = ch)),
            )
        }
        return layout
    }
    return ManifestLayout(
        id = layout?.id ?: "full",
        width = cw,
        height = ch,
        background = layout?.background ?: "#000000",
        zones = listOf(
            ManifestZone(
                id = "full",
                type = ZoneKind.VIDEO,
                x = 0,
                y = 0,
                width = cw,
                height = ch,
                fit = FitMode.CONTAIN,
                contentRef = null,
            ),
        ),
    )
}

/** True when the zone covers the authored canvas (playlist / full-screen media). */
fun isFullBleedZone(zone: ManifestZone, layoutWidth: Int, layoutHeight: Int): Boolean {
    val lw = layoutWidth.coerceAtLeast(1)
    val lh = layoutHeight.coerceAtLeast(1)
    if (zone.x > 0 || zone.y > 0) return false
    val coversWidth = zone.width >= (lw * 95) / 100
    val coversHeight = zone.height >= (lh * 95) / 100
    return coversWidth && coversHeight
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
    canvasWidth: Int? = manifest.width,
    canvasHeight: Int? = manifest.height,
): ZonePlan {
    val layout = effectiveLayout(manifest, canvasWidth, canvasHeight)
    val byFile = manifest.assets.associateBy { it.localFilename }
    val byId = manifest.assets.associateBy { it.id }
    val hasPlaylist = manifest.playlist?.items?.isNotEmpty() == true
    // Keep zone rects in layout pixel space. [ScaledLayoutCanvas] maps the full canvas
    // onto the oriented frame — scaling to physical landscape metrics here broke portrait
    // (1080×1920 layout crushed onto 1920×1080 display metrics).
    val zones = layout.zones.map { zone ->
        PlannedZone(
            id = zone.id,
            rect = IntRect(
                x = zone.x,
                y = zone.y,
                width = zone.width.coerceAtLeast(1),
                height = zone.height.coerceAtLeast(1),
            ),
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
