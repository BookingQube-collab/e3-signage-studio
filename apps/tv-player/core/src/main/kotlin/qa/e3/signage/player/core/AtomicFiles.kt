package qa.e3.signage.player.core

import java.io.File
import java.io.FileOutputStream

sealed class FinalizeResult {
    data class Moved(val file: File) : FinalizeResult()
    data class ChecksumMismatch(val expected: String, val actual: String) : FinalizeResult()
    data object MissingTemp : FinalizeResult()
}

fun versionedManifestFile(manifestsDir: File, version: Int): File =
    File(manifestsDir, "v$version.json")

fun activeManifestFile(manifestsDir: File): File =
    File(manifestsDir, "active.json")

fun tempDownloadFile(tempDir: File, localFilename: String): File {
    val name = safeLocalFilename(localFilename) ?: "asset.tmp"
    return File(tempDir, "$name.tmp")
}

fun expectedMediaFile(root: File, asset: ManifestAsset): File {
    val name = safeLocalFilename(asset.localFilename) ?: asset.localFilename
    return File(File(root, "media/${mediaFolder(asset.type)}"), name)
}

fun atomicWriteText(target: File, text: String) {
    target.parentFile?.mkdirs()
    val tmp = File(target.parentFile, "${target.name}.tmp")
    FileOutputStream(tmp).use { fos ->
        fos.write(text.toByteArray(Charsets.UTF_8))
        fos.flush()
        fos.fd.sync()
    }
    atomicMove(tmp, target)
}

fun writeVersionedManifest(manifestsDir: File, version: Int, json: String): File {
    manifestsDir.mkdirs()
    val target = versionedManifestFile(manifestsDir, version)
    atomicWriteText(target, json)
    return target
}

fun pointActiveManifest(manifestsDir: File, versioned: File): File {
    require(versioned.isFile) { "Versioned manifest missing; cannot point ACTIVE." }
    manifestsDir.mkdirs()
    val active = activeManifestFile(manifestsDir)
    atomicWriteText(active, versioned.readText())
    return active
}

fun commitActiveSwitch(manifestsDir: File, ready: PackageSnapshot, versioned: File): File {
    require(canBecomeActive(ready.state)) { "ACTIVE is only updated after READY." }
    return pointActiveManifest(manifestsDir, versioned)
}

fun finalizeVerifiedFile(tmpFile: File, finalFile: File, expectedChecksum: String): FinalizeResult {
    if (!tmpFile.isFile) return FinalizeResult.MissingTemp
    val actual = sha256Hex(tmpFile)
    if (!checksumsEqual(actual, expectedChecksum)) {
        tmpFile.delete()
        return FinalizeResult.ChecksumMismatch(expectedChecksum, actual)
    }
    finalFile.parentFile?.mkdirs()
    atomicMove(tmpFile, finalFile)
    return FinalizeResult.Moved(finalFile)
}

fun atomicMove(from: File, to: File) {
    to.parentFile?.mkdirs()
    if (to.exists()) to.delete()
    if (from.renameTo(to)) return
    from.copyTo(to, overwrite = true)
    from.delete()
}
