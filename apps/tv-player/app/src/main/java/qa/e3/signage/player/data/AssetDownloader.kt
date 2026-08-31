package qa.e3.signage.player.data

import okhttp3.OkHttpClient
import okhttp3.Request
import qa.e3.signage.player.core.DOWNLOAD_STALL_TIMEOUT_MS
import qa.e3.signage.player.core.FinalizeResult
import qa.e3.signage.player.core.ManifestAsset
import qa.e3.signage.player.core.downloadStallMessage
import qa.e3.signage.player.core.expectedMediaFile
import qa.e3.signage.player.core.finalizeVerifiedFile
import qa.e3.signage.player.core.safeLocalFilename
import qa.e3.signage.player.core.tempDownloadFile
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

class ChecksumFailedException(
    val assetId: String,
    val localFilename: String,
) : IOException("Checksum mismatch for $localFilename")

class DownloadStalledException(
    message: String = downloadStallMessage(),
) : IOException(message)

class AssetDownloader(private val client: OkHttpClient) {
    fun downloadVerified(
        asset: ManifestAsset,
        root: File,
        onBytes: (Long) -> Unit,
    ): File {
        val filename = safeLocalFilename(asset.localFilename)
            ?: throw IOException("Unsafe local filename")
        if (asset.downloadUrl.isBlank()) {
            throw IOException("Missing signed download URL for $filename")
        }
        val tempDir = File(root, "temp").apply { mkdirs() }
        val tmp = tempDownloadFile(tempDir, filename)
        val finalFile = expectedMediaFile(root, asset)
        var lastChecksumError: ChecksumFailedException? = null
        repeat(CHECKSUM_ATTEMPTS) {
            try {
                downloadToTemp(asset, tmp, onBytes)
                when (val result = finalizeVerifiedFile(tmp, finalFile, asset.checksum)) {
                    is FinalizeResult.Moved -> return result.file
                    is FinalizeResult.ChecksumMismatch -> {
                        tmp.delete()
                        lastChecksumError = ChecksumFailedException(asset.id, filename)
                    }
                    FinalizeResult.MissingTemp -> {
                        lastChecksumError = ChecksumFailedException(asset.id, filename)
                    }
                }
            } catch (error: ChecksumFailedException) {
                tmp.delete()
                lastChecksumError = error
            }
        }
        tmp.delete()
        throw lastChecksumError ?: ChecksumFailedException(asset.id, filename)
    }

    private fun downloadToTemp(asset: ManifestAsset, tmp: File, onBytes: (Long) -> Unit) {
        tmp.parentFile?.mkdirs()
        val existing = if (tmp.isFile) tmp.length() else 0L
        val request = Request.Builder().url(asset.downloadUrl).apply {
            if (existing > 0L) header("Range", "bytes=$existing-")
        }.build()
        client.newCall(request).execute().use { response ->
            when (response.code) {
                200 -> {
                    val body = response.body ?: throw IOException("Empty body for ${asset.localFilename}")
                    FileOutputStream(tmp, false).use { out ->
                        copyStream(body.byteStream(), out, onBytes, 0L)
                    }
                }
                206 -> {
                    val body = response.body ?: throw IOException("Empty body for ${asset.localFilename}")
                    FileOutputStream(tmp, true).use { out ->
                        copyStream(body.byteStream(), out, onBytes, existing)
                    }
                }
                416 -> {
                    if (asset.fileSize > 0L && existing >= asset.fileSize) return
                    tmp.delete()
                    throw IOException("Unsatisfiable range for ${asset.localFilename}")
                }
                else -> throw IOException("HTTP ${response.code} downloading ${asset.localFilename}")
            }
        }
        if (asset.fileSize > 0L) {
            val length = tmp.length()
            if (length < asset.fileSize) {
                throw IOException("Incomplete download for ${asset.localFilename}")
            }
            if (length > asset.fileSize) {
                tmp.delete()
                throw IOException("Oversize download for ${asset.localFilename}")
            }
        }
    }

    private fun copyStream(input: InputStream, out: OutputStream, onBytes: (Long) -> Unit, start: Long) {
        var total = start
        var windowStartNs = System.nanoTime()
        var windowStartBytes = start
        if (start > 0L) onBytes(start)
        val buf = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val n = input.read(buf)
            if (n <= 0) break
            out.write(buf, 0, n)
            total += n
            onBytes(total)
            val now = System.nanoTime()
            val windowMs = (now - windowStartNs) / 1_000_000L
            if (windowMs >= DOWNLOAD_STALL_TIMEOUT_MS) {
                if (total <= windowStartBytes) {
                    throw DownloadStalledException()
                }
                windowStartNs = now
                windowStartBytes = total
            }
        }
        out.flush()
        if (out is FileOutputStream) out.fd.sync()
    }

    private companion object {
        const val CHECKSUM_ATTEMPTS = 3
        const val DEFAULT_BUFFER_SIZE = 64 * 1024
    }
}
