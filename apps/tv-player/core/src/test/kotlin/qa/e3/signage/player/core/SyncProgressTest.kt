package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class SyncProgressTest {
    @Test
    fun formatIncludesIndexAndFilename() {
        assertEquals("1/2 · a.mp4", formatSyncFileLabel(1, 2, "a.mp4"))
        assertEquals("file", formatSyncFileLabel(1, 0, null))
    }

    @Test
    fun stallMessageMentionsMinutes() {
        assertTrue(downloadStallMessage(3 * 60_000L).contains("3 min"))
    }

    @Test
    fun hasPlayableWhenFirstVideoOnDisk() {
        val root = createTempDirectory("e3-playable").toFile()
        File(root, "media/video").mkdirs()
        File(root, "media/video/first.mp4").writeText("mp4")
        val manifest = ContentManifest(
            screenId = "s1",
            manifestVersion = 1,
            configVersion = 1,
            generatedAt = "2026-08-31T00:00:00Z",
            assets = listOf(
                ManifestAsset("v1", 1, MediaKind.VIDEO, "a".repeat(64), 1, "first.mp4", "video/mp4"),
                ManifestAsset("v2", 1, MediaKind.VIDEO, "b".repeat(64), 1, "second.mp4", "video/mp4"),
            ),
            playlist = ManifestPlaylist(
                id = "pl",
                version = 1,
                loop = true,
                items = listOf(
                    ManifestPlaylistItem("v1", "v1", 10.0, "CUT", "first.mp4"),
                    ManifestPlaylistItem("v2", "v2", 10.0, "CUT", "second.mp4"),
                ),
            ),
            layouts = emptyList(),
            schedules = emptyList(),
        )
        assertTrue(hasPlayableLocalPlaylistItem(manifest, root))
        File(root, "media/video/first.mp4").delete()
        assertFalse(hasPlayableLocalPlaylistItem(manifest, root))
    }
}
