package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
    fun layoutOnlyCampaignResolvesStaticVideoAndImages() {
        val root = createTempDirectory("e3-layout-only").toFile()
        File(root, "media/video").mkdirs()
        File(root, "media/image").mkdirs()
        File(root, "media/video/dd.mp4").writeText("mp4")
        File(root, "media/image/jianna.jpeg").writeText("jpg")
        File(root, "media/image/rupert.jpeg").writeText("jpg")
        val manifest = ContentManifest(
            screenId = "s",
            manifestVersion = 1,
            configVersion = 1,
            generatedAt = "2026-08-30T00:00:00Z",
            playlist = null,
            layouts = listOf(
                ManifestLayout(
                    "lay",
                    1920,
                    1080,
                    "#19161A",
                    listOf(
                        ManifestZone("main", ZoneKind.VIDEO, 0, 0, 1280, 1080, FitMode.CONTAIN, "dd.mp4"),
                        ManifestZone("top", ZoneKind.IMAGE, 1280, 0, 640, 540, FitMode.CONTAIN, "jianna.jpeg"),
                        ManifestZone("bottom", ZoneKind.IMAGE, 1280, 540, 640, 540, FitMode.CONTAIN, "rupert.jpeg"),
                    ),
                ),
            ),
            assets = listOf(
                ManifestAsset("vid", 1, MediaKind.VIDEO, "a".repeat(64), 1, "dd.mp4", "video/mp4"),
                ManifestAsset("img1", 1, MediaKind.IMAGE, "b".repeat(64), 1, "jianna.jpeg", "image/jpeg"),
                ManifestAsset("img2", 1, MediaKind.IMAGE, "c".repeat(64), 1, "rupert.jpeg", "image/jpeg"),
            ),
        )
        val plan = planZones(manifest, root, 1920, 1080)
        assertTrue(hasPlayableLayoutContent(plan))
        val main = plan.zones[0].source as ZoneSource.StaticFile
        assertEquals(PlaylistItemKind.VIDEO, main.kind)
        assertTrue(main.fileUri.startsWith("file:"))
        assertEquals(PlaylistItemKind.IMAGE, (plan.zones[1].source as ZoneSource.StaticFile).kind)
        assertEquals(PlaylistItemKind.IMAGE, (plan.zones[2].source as ZoneSource.StaticFile).kind)
    }

    @Test
    fun layoutWithoutFilesAndWithoutPlaylistIsEmpty() {
        val root = createTempDirectory("e3-empty-layout").toFile()
        val manifest = ContentManifest(
            screenId = "s",
            manifestVersion = 1,
            configVersion = 1,
            generatedAt = "2026-08-30T00:00:00Z",
            playlist = null,
            layouts = listOf(
                ManifestLayout(
                    "lay",
                    1920,
                    1080,
                    "#19161A",
                    listOf(ManifestZone("main", ZoneKind.VIDEO, 0, 0, 1920, 1080, FitMode.CONTAIN, "missing.mp4")),
                ),
            ),
        )
        val plan = planZones(manifest, root, 1920, 1080)
        assertTrue(plan.zones[0].source is ZoneSource.Empty)
        assertFalse(hasPlayableLayoutContent(plan))
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
