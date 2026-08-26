package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class PlaylistSequencerTest {
    private fun item(id: String, file: String, kind: PlaylistItemKind, seconds: Double = 10.0) =
        ResolvedPlaylistItem(id, id, seconds, "FADE", file, kind, "file:///tmp/$file")

    @Test
    fun mixedPlaylistThenLoops() {
        val seq = PlaylistSequencer(
            listOf(
                item("1", "Welcome.mp4", PlaylistItemKind.VIDEO, 30.0),
                item("2", "Birthday.jpg", PlaylistItemKind.IMAGE, 10.0),
                item("3", "Promotion.mp4", PlaylistItemKind.VIDEO, 45.0),
                item("4", "Instagram.png", PlaylistItemKind.IMAGE, 15.0),
            ),
            loop = true,
        )
        assertEquals("1", seq.current()?.mediaId)
        assertEquals("2", seq.advance()?.mediaId)
        assertEquals(10.0, seq.current()?.durationSeconds ?: 0.0, 0.01)
        seq.advance()
        seq.advance()
        assertEquals("4", seq.current()?.mediaId)
        assertEquals("1", seq.advance()?.mediaId)
    }

    @Test
    fun errorSkipsToNextItem() {
        val seq = PlaylistSequencer(
            listOf(item("bad", "broken.mp4", PlaylistItemKind.VIDEO), item("ok", "ok.jpg", PlaylistItemKind.IMAGE)),
            loop = false,
        )
        assertEquals("ok", seq.skipCurrent()?.mediaId)
        assertNull(seq.advance())
    }

    @Test
    fun dropsHttpUris() {
        val seq = PlaylistSequencer(
            listOf(
                ResolvedPlaylistItem("x", "x", 10.0, "CUT", "cloud.mp4", PlaylistItemKind.VIDEO, "https://cdn/x.mp4"),
                item("local", "ok.jpg", PlaylistItemKind.IMAGE),
            ),
            loop = false,
        )
        assertEquals("local", seq.current()?.mediaId)
        assertEquals(1, seq.size())
    }

    @Test
    fun resolveSkipsMissingFilesAndKeepsLocalUris() {
        val root = createTempDirectory("e3-pl").toFile()
        File(root, "media/image").mkdirs()
        File(root, "media/video").mkdirs()
        File(root, "media/image/Birthday.jpg").writeText("jpg")
        File(root, "media/video/Welcome.mp4").writeText("mp4")
        val playlist = ManifestPlaylist(
            id = "p1",
            version = 1,
            loop = true,
            items = listOf(
                ManifestPlaylistItem("m1", "v1", 30.0, "CUT", "Welcome.mp4"),
                ManifestPlaylistItem("m2", "v2", 10.0, "FADE", "Birthday.jpg"),
                ManifestPlaylistItem("m3", "v3", 15.0, "CUT", "missing.webp"),
            ),
        )
        val assets = listOf(
            ManifestAsset("m1", 1, MediaKind.VIDEO, "a".repeat(64), 1, "Welcome.mp4", "video/mp4"),
            ManifestAsset("m2", 1, MediaKind.IMAGE, "b".repeat(64), 1, "Birthday.jpg", "image/jpeg"),
            ManifestAsset("m3", 1, MediaKind.IMAGE, "c".repeat(64), 1, "missing.webp", "image/webp"),
        )
        val resolved = resolvePlaylistItems(playlist, assets, root)
        assertEquals(listOf("m1", "m2"), resolved.map { it.mediaId })
        assertTrue(resolved.all { it.fileUri.startsWith("file:") })
        assertEquals(PlaylistItemKind.VIDEO, resolved[0].kind)
        assertEquals(PlaylistItemKind.IMAGE, resolved[1].kind)
    }
}
