package qa.e3.signage.player.core

import java.io.File
import java.security.MessageDigest

fun sha256Hex(bytes: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256")
    return toHex(digest.digest(bytes))
}

fun sha256Hex(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buf = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val n = input.read(buf)
            if (n <= 0) break
            digest.update(buf, 0, n)
        }
    }
    return toHex(digest.digest())
}

fun checksumsEqual(actual: String, expected: String): Boolean =
    actual.equals(expected, ignoreCase = true)

fun checksumMatches(file: File, expectedHex: String): Boolean {
    if (!file.isFile) return false
    return checksumsEqual(sha256Hex(file), expectedHex)
}

/** Returns the first asset that is missing or whose SHA-256 does not match. */
fun firstInvalidAsset(root: File, assets: List<ManifestAsset>): ManifestAsset? =
    assets.firstOrNull { !checksumMatches(expectedMediaFile(root, it), it.checksum) }

private fun toHex(bytes: ByteArray): String =
    bytes.joinToString("") { b -> "%02x".format(b.toInt() and 0xff) }
