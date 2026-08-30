package qa.e3.signage.player.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import qa.e3.signage.player.core.DisplayOrientation

/**
 * Persists CMS screen orientation + oriented canvas size so the player can apply
 * full-bleed software rotation immediately on launch, then refresh on every
 * sync-status poll and on every package activation.
 *
 * Android TV panels report landscape metrics even when mounted vertically, so the
 * activity stays landscape and [qa.e3.signage.player.ui.DisplayOrientedFrame] rotates.
 *
 * Four Windows-style corners (clockwise):
 * - LANDSCAPE → 0°
 * - PORTRAIT_UPSIDE_DOWN → 90°
 * - LANDSCAPE_UPSIDE_DOWN → 180°
 * - PORTRAIT → 270°
 */
class ScreenDisplayStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val _orientation = MutableStateFlow(readPersistedOrientation())
    val orientation: StateFlow<String> = _orientation.asStateFlow()

    private val _canvasWidth = MutableStateFlow(readPersistedWidth())
    val canvasWidth: StateFlow<Int> = _canvasWidth.asStateFlow()

    private val _canvasHeight = MutableStateFlow(readPersistedHeight())
    val canvasHeight: StateFlow<Int> = _canvasHeight.asStateFlow()

    /** Apply orientation (+ optional canvas size) from sync-status or an activated manifest. */
    fun applyFromSync(raw: String?, width: Int? = null, height: Int? = null) {
        val next = normalize(raw)
        val oriented = DisplayOrientation.orientedCanvasSize(
            width = width ?: _canvasWidth.value,
            height = height ?: _canvasHeight.value,
            orientation = next,
        )
        val orientationChanged = _orientation.value != next
        val sizeChanged =
            _canvasWidth.value != oriented.widthPx || _canvasHeight.value != oriented.heightPx
        if (!orientationChanged && !sizeChanged) return
        prefs.edit()
            .putString(KEY_ORIENTATION, next)
            .putInt(KEY_WIDTH, oriented.widthPx)
            .putInt(KEY_HEIGHT, oriented.heightPx)
            .commit()
        _orientation.value = next
        _canvasWidth.value = oriented.widthPx
        _canvasHeight.value = oriented.heightPx
    }

    private fun readPersistedOrientation(): String =
        normalize(prefs.getString(KEY_ORIENTATION, LANDSCAPE))

    private fun readPersistedWidth(): Int {
        val w = prefs.getInt(KEY_WIDTH, 0)
        val h = prefs.getInt(KEY_HEIGHT, 0)
        val orientation = readPersistedOrientation()
        return DisplayOrientation.orientedCanvasSize(
            width = w.takeIf { it > 0 } ?: defaultWidth(orientation),
            height = h.takeIf { it > 0 } ?: defaultHeight(orientation),
            orientation = orientation,
        ).widthPx
    }

    private fun readPersistedHeight(): Int {
        val w = prefs.getInt(KEY_WIDTH, 0)
        val h = prefs.getInt(KEY_HEIGHT, 0)
        val orientation = readPersistedOrientation()
        return DisplayOrientation.orientedCanvasSize(
            width = w.takeIf { it > 0 } ?: defaultWidth(orientation),
            height = h.takeIf { it > 0 } ?: defaultHeight(orientation),
            orientation = orientation,
        ).heightPx
    }

    companion object {
        private const val PREFS = "e3_screen_display"
        private const val KEY_ORIENTATION = "orientation"
        private const val KEY_WIDTH = "canvas_width"
        private const val KEY_HEIGHT = "canvas_height"
        const val LANDSCAPE = DisplayOrientation.LANDSCAPE
        const val PORTRAIT = DisplayOrientation.PORTRAIT
        const val LANDSCAPE_UPSIDE_DOWN = DisplayOrientation.LANDSCAPE_UPSIDE_DOWN
        const val PORTRAIT_UPSIDE_DOWN = DisplayOrientation.PORTRAIT_UPSIDE_DOWN

        fun normalize(raw: String?): String = DisplayOrientation.normalize(raw)

        fun isPortrait(orientation: String): Boolean = DisplayOrientation.isPortrait(orientation)

        fun swapsAxes(orientation: String): Boolean = DisplayOrientation.swapsAxes(orientation)

        fun rotationDegrees(orientation: String): Float = DisplayOrientation.rotationDegrees(orientation)

        private fun defaultWidth(orientation: String): Int =
            if (isPortrait(orientation)) 1080 else 1920

        private fun defaultHeight(orientation: String): Int =
            if (isPortrait(orientation)) 1920 else 1080
    }
}
