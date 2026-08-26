package qa.e3.signage.player.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import qa.e3.signage.player.core.DeviceCredentialStore
import qa.e3.signage.player.core.DeviceCredentials

class EncryptedCredentialStore(context: Context) : DeviceCredentialStore {
    private val prefs: SharedPreferences = createPrefs(context.applicationContext)

    override fun read(): DeviceCredentials? {
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        val deviceId = prefs.getString(KEY_DEVICE_ID, null) ?: return null
        val screenId = prefs.getString(KEY_SCREEN_ID, null) ?: return null
        if (token.isBlank() || deviceId.isBlank() || screenId.isBlank()) return null
        return DeviceCredentials(token, deviceId, screenId)
    }

    override fun save(credentials: DeviceCredentials) {
        prefs.edit()
            .putString(KEY_TOKEN, credentials.deviceToken)
            .putString(KEY_DEVICE_ID, credentials.deviceId)
            .putString(KEY_SCREEN_ID, credentials.screenId)
            .apply()
    }

    override fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val FILE = "e3_device_creds"
        const val KEY_TOKEN = "device_token"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_SCREEN_ID = "screen_id"

        fun createPrefs(context: Context): SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            return EncryptedSharedPreferences.create(
                context,
                FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }
    }
}
