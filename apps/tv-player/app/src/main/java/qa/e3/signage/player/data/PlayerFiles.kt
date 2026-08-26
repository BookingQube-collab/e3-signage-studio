package qa.e3.signage.player.data

import android.content.Context
import java.io.File

object PlayerFiles {
    fun root(context: Context): File = File(context.filesDir, "files")

    fun mediaImage(context: Context): File = File(root(context), "media/image")

    fun mediaVideo(context: Context): File = File(root(context), "media/video")

    fun manifests(context: Context): File = File(root(context), "manifests")

    fun activeManifest(context: Context): File = File(manifests(context), "active.json")

    fun cache(context: Context): File = File(root(context), "cache")

    fun temp(context: Context): File = File(root(context), "temp")

    fun versionedManifest(context: Context, version: Int): File =
        File(manifests(context), "v$version.json")

    fun ensure(context: Context) {
        listOf(
            mediaImage(context),
            mediaVideo(context),
            manifests(context),
            cache(context),
            temp(context),
        ).forEach { it.mkdirs() }
    }
}
