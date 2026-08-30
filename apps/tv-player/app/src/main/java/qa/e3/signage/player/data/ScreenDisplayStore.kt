package qa.e3.signage.player.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Persists CMS screen orientation so the activity can lock portrait/landscape
 * immediately on launch, then refresh on every sync-status poll.
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

        fun normalize(raw: String?): String =
            if (raw?.equals(PORTRAIT, ignoreCase = true) == true) PORTRAIT else LANDSCAPE
    }
}
