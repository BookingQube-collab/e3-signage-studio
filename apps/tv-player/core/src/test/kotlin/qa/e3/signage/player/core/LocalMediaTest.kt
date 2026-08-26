package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class LocalMediaTest {
    @Test
    fun fileUriIsLocalAndRemoteIsRejected() {
        val dir = createTempDirectory("e3-media").toFile()
        val file = File(dir, "clip.mp4")
        file.writeText("x")
        val uri = localFileUri(file)
        assertTrue(uri.startsWith("file:"))
        assertFalse(isRemotePlaybackUri(uri))
        assertTrue(isRemotePlaybackUri("https://cdn.example/clip.mp4"))
        assertTrue(isRemotePlaybackUri("http://10.0.0.1/a.mp4"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun cloudUrlCannotBeForcedIntoPlayback() {
        requireLocalPlaybackUri("https://signed.example/media.mp4")
    }

    @Test
    fun resolvesVideoThenImageFolders() {
        val root = createTempDirectory("e3-root").toFile()
        File(root, "media/video").mkdirs()
        val clip = File(root, "media/video/b742c8_v4.mp4")
        clip.writeText("mp4")
        val found = resolveLocalMedia(root, MediaKind.VIDEO, "b742c8_v4.mp4")
        assertEquals(clip.canonicalFile, found?.canonicalFile)
        assertEquals(null, resolveLocalMedia(root, MediaKind.VIDEO, "../secret.mp4"))
    }
}
