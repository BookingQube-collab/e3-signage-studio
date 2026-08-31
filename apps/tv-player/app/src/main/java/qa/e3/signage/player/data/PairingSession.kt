package qa.e3.signage.player.data

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import qa.e3.signage.player.core.DeviceCredentialStore

/**
 * Tracks whether this device still has a usable pairing. CMS Repair / Unpair revoke
 * the device token; the next authenticated call returns 401 and [invalidate] clears
 * local credentials so [PlayerActivity] can show the pairing-code UI again.
 */
class PairingSession(
    private val store: DeviceCredentialStore,
) {
    private val _paired = MutableStateFlow(store.read() != null)
    val paired: StateFlow<Boolean> = _paired.asStateFlow()

    fun markPaired() {
        _paired.value = true
    }

    /** Drop local credentials and return to the pairing-code screen. */
    fun invalidate(reason: String) {
        Log.w(TAG, "session invalidated: $reason")
        store.clear()
        _paired.value = false
    }

    fun handleAuthFailure(httpCode: Int, source: String): Boolean {
        if (httpCode != 401 && httpCode != 403) return false
        invalidate("$source HTTP $httpCode")
        return true
    }

    private companion object {
        const val TAG = "E3PairingSession"
    }
}
