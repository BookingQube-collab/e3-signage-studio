package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class StoragePruneTest {
    @Test
    fun cacheIsRemovedWhileActiveAssetsStay() {
        val root = layout()
        val keep = listOf(asset("keep-vid", "loop.mp4", MediaKind.VIDEO), asset("keep-img", "hero.jpg", MediaKind.IMAGE))
        val result = pruneUnusedStorage(root, keep, availableBytes = LOW_STORAGE_BYTES)
        assertFalse(File(root, "cache/junk.bin").exists())
        assertTrue(File(root, "media/video/loop.mp4").isFile)
        assertTrue(File(root, "media/image/hero.jpg").isFile)
        assertTrue(File(root, "media/video/old.mp4").isFile)
        assertTrue(File(root, "temp/clip.mp4.tmp").isFile)
        assertEquals(1, result.deleted.size)
    }

    @Test
    fun nearlyFullRemovesUnusedMediaButNotActive() {
        val root = layout()
        val keep = listOf(asset("keep-vid", "loop.mp4", MediaKind.VIDEO), asset("keep-img", "hero.jpg", MediaKind.IMAGE))
        val result = pruneUnusedStorage(root, keep, availableBytes = 8L * 1024L * 1024L)
        assertFalse(File(root, "media/video/old.mp4").exists())
        assertFalse(File(root, "cache/junk.bin").exists())
        assertFalse(File(root, "temp/clip.mp4.tmp").exists())
        assertTrue(File(root, "media/video/loop.mp4").isFile)
        assertTrue(File(root, "media/image/hero.jpg").isFile)
        assertTrue(result.kept.any { it.name == "loop.mp4" })
    }

    private fun layout(): File {
        val root = createTempDirectory("e3-prune").toFile()
        File(root, "media/video").mkdirs()
        File(root, "media/image").mkdirs()
        File(root, "cache").mkdirs()
        File(root, "temp").mkdirs()
        File(root, "media/video/loop.mp4").writeText("video")
        File(root, "media/video/old.mp4").writeText("stale")
        File(root, "media/image/hero.jpg").writeText("image")
        File(root, "cache/junk.bin").writeText("cache")
        File(root, "temp/clip.mp4.tmp").writeText("partial")
        return root
    }

    private fun asset(id: String, filename: String, type: MediaKind) = ManifestAsset(
        id = id,
        version = 1,
        type = type,
        checksum = "d".repeat(64),
        fileSize = 10,
        localFilename = filename,
        mimeType = if (type == MediaKind.VIDEO) "video/mp4" else "image/jpeg",
    )
}
