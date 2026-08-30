package qa.e3.signage.player.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Persists CMS screen orientation so the player can apply full-bleed software rotation
 * immediately on launch, then refresh on every sync-status poll.
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
    private val _orientation = MutableStateFlow(readPersisted())
    val orientation: StateFlow<String> = _orientation.asStateFlow()

    fun applyFromSync(raw: String?) {
        val next = normalize(raw)
        if (_orientation.value == next) return
        prefs.edit().putString(KEY_ORIENTATION, next).apply()
        _orientation.value = next
    }

    private fun readPersisted(): String = normalize(prefs.getString(KEY_ORIENTATION, LANDSCAPE))

    companion object {
        private const val PREFS = "e3_screen_display"
        private const val KEY_ORIENTATION = "orientation"
        const val LANDSCAPE = "LANDSCAPE"
        const val PORTRAIT = "PORTRAIT"
        const val LANDSCAPE_UPSIDE_DOWN = "LANDSCAPE_UPSIDE_DOWN"
        const val PORTRAIT_UPSIDE_DOWN = "PORTRAIT_UPSIDE_DOWN"

        fun normalize(raw: String?): String {
            val value = raw?.trim()?.uppercase().orEmpty()
            return when (value) {
                PORTRAIT -> PORTRAIT
                PORTRAIT_UPSIDE_DOWN,
                "PORTRAIT_REVERSE",
                "REVERSE_PORTRAIT",
                "PORTRAIT_INVERTED",
                -> PORTRAIT_UPSIDE_DOWN
                LANDSCAPE_UPSIDE_DOWN,
                "LANDSCAPE_REVERSE",
                "REVERSE_LANDSCAPE",
                "LANDSCAPE_INVERTED",
                -> LANDSCAPE_UPSIDE_DOWN
                else -> LANDSCAPE
            }
        }

        fun isPortrait(orientation: String): Boolean =
            orientation == PORTRAIT || orientation == PORTRAIT_UPSIDE_DOWN

        /** True when the child must lay out at swapped (height × width) before rotating. */
        fun swapsAxes(orientation: String): Boolean =
            when (normalize(orientation)) {
                PORTRAIT, PORTRAIT_UPSIDE_DOWN -> true
                else -> false
            }

        /** Compose rotationZ degrees for [DisplayOrientedFrame] (clockwise). */
        fun rotationDegrees(orientation: String): Float =
            when (normalize(orientation)) {
                PORTRAIT -> 270f
                PORTRAIT_UPSIDE_DOWN -> 90f
                LANDSCAPE_UPSIDE_DOWN -> 180f
                else -> 0f
            }
    }
}
