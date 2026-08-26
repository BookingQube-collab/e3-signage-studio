package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class ZonePlanTest {
    @Test
    fun scalesFullScreenZoneToPhysicalDisplay() {
        val zone = ManifestZone("z", ZoneKind.VIDEO, 0, 0, 1920, 1080, FitMode.CONTAIN, null)
        val rect = scaleZone(zone, 1920, 1080, 3840, 2160)
        assertEquals(IntRect(0, 0, 3840, 2160), rect)
    }

    @Test
    fun sideBannerKeepsIndependentZone() {
        val video = ManifestZone("v", ZoneKind.VIDEO, 0, 0, 1344, 1080, FitMode.COVER, null)
        val image = ManifestZone("i", ZoneKind.IMAGE, 1344, 0, 576, 1080, FitMode.CONTAIN, "logo.webp")
        val rect = scaleZone(image, 1920, 1080, 1920, 1080)
        assertEquals(1344, rect.x)
        assertEquals(576, rect.width)
        assertEquals("FIT", exoResizeMode(FitMode.CONTAIN))
        assertEquals("ZOOM", exoResizeMode(FitMode.COVER))
        assertEquals("FILL", exoResizeMode(FitMode.STRETCH))
        assertEquals("ZOOM", exoResizeMode(FitMode.FILL))
        assertTrue(video.width > image.width)
    }

    @Test
    fun playlistZoneAndStaticFileFromContentRef() {
        val root = createTempDirectory("e3-zones").toFile()
        File(root, "media/image").mkdirs()
        File(root, "media/image/side.png").writeText("png")
        val manifest = ContentManifest(
            screenId = "s",
            manifestVersion = 1,
            configVersion = 1,
            generatedAt = "2026-08-25T00:00:00Z",
            playlist = ManifestPlaylist("p", 1, true, listOf(ManifestPlaylistItem("m", "v", 10.0, "CUT", "clip.mp4"))),
            layouts = listOf(
                ManifestLayout(
                    "lay",
                    1920,
                    1080,
                    "#19161A",
                    listOf(
                        ManifestZone("main", ZoneKind.VIDEO, 0, 0, 1280, 1080, FitMode.CONTAIN, null),
                        ManifestZone("side", ZoneKind.IMAGE, 1280, 0, 640, 1080, FitMode.CONTAIN, "side.png"),
                    ),
                ),
            ),
            assets = listOf(
                ManifestAsset("side-id", 1, MediaKind.IMAGE, "d".repeat(64), 1, "side.png", "image/png"),
            ),
        )
        val plan = planZones(manifest, root, 1920, 1080)
        assertTrue(plan.zones[0].source is ZoneSource.Playlist)
        val static = plan.zones[1].source as ZoneSource.StaticFile
        assertTrue(static.fileUri.startsWith("file:"))
        assertEquals(PlaylistItemKind.IMAGE, static.kind)
    }

    @Test
    fun missingLayoutBecomesFullScreenPlaylistZone() {
        val manifest = ContentManifest(
            screenId = "s",
            manifestVersion = 1,
            configVersion = 1,
            generatedAt = "2026-08-25T00:00:00Z",
            playlist = ManifestPlaylist("p", 1, true, emptyList()),
        )
        val layout = effectiveLayout(manifest)
        assertEquals(1, layout.zones.size)
        assertEquals(1920, layout.zones[0].width)
    }
}
