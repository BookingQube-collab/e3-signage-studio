package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class ChecksumAndFinalizeTest {
    @Test
    fun sha256OfKnownBytes() {
        val hex = sha256Hex("hello".toByteArray())
        assertEquals("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", hex)
        val dir = createTempDirectory("e3-sha").toFile()
        val file = File(dir, "hello.bin")
        file.writeText("hello")
        assertTrue(checksumMatches(file, hex))
    }

    @Test
    fun checksumFailDeletesTmpAndDoesNotMoveToFinal() {
        val dir = createTempDirectory("e3-finalize").toFile()
        val tmp = File(dir, "clip.mp4.tmp")
        tmp.writeBytes(byteArrayOf(1, 2, 3, 4))
        val final = File(dir, "media/video/clip.mp4")
        val expected = sha256Hex("not-this".toByteArray())
        val result = finalizeVerifiedFile(tmp, final, expected)
        assertTrue(result is FinalizeResult.ChecksumMismatch)
        assertFalse(tmp.exists())
        assertFalse(final.exists())
    }

    @Test
    fun firstInvalidAssetFindsCorruptFinalFile() {
        val root = createTempDirectory("e3-invalid").toFile()
        val asset = ManifestAsset(
            id = "clip",
            version = 1,
            type = MediaKind.VIDEO,
            checksum = sha256Hex("expected".toByteArray()),
            fileSize = 8,
            localFilename = "clip_v1.mp4",
            mimeType = "video/mp4",
        )
        val final = expectedMediaFile(root, asset)
        final.parentFile?.mkdirs()
        final.writeText("corrupt")
        assertEquals("clip", firstInvalidAsset(root, listOf(asset))?.id)
        final.writeText("expected")
        assertEquals(null, firstInvalidAsset(root, listOf(asset)))
    }

    @Test
    fun matchingChecksumMovesAtomicallyToFinal() {
        val dir = createTempDirectory("e3-ok").toFile()
        val bytes = "payload".toByteArray()
        val tmp = File(dir, "clip.mp4.tmp")
        tmp.writeBytes(bytes)
        val final = File(File(dir, "media/video"), "clip.mp4")
        val result = finalizeVerifiedFile(tmp, final, sha256Hex(bytes))
        assertTrue(result is FinalizeResult.Moved)
        assertFalse(tmp.exists())
        assertTrue(final.isFile)
        assertEquals("payload", final.readText())
    }
}
