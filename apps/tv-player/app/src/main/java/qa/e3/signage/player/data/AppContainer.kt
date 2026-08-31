package qa.e3.signage.player.data

import android.content.Context
import kotlinx.serialization.json.Json
import qa.e3.signage.player.BuildConfig
import qa.e3.signage.player.core.DeviceApi
import qa.e3.signage.player.core.DeviceCredentialStore
import qa.e3.signage.player.core.PairingCoordinator

class AppContainer(context: Context) {
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
        explicitNulls = false
    }

    val db: PlayerDatabase = PlayerDatabase.create(context)
    val store: DeviceCredentialStore = EncryptedCredentialStore(context)
    val session = PairingSession(store)
    val apiBaseUrl: String = BuildConfig.API_BASE_URL.trim()
    val api: DeviceApi = RetrofitDeviceApi(
        apiBaseUrl.ifBlank { "https://e3-cms.vercel.app" },
        json,
    )
    val pairing: PairingCoordinator = PairingCoordinator(api, store)
    val packages = LocalPackageStore(db, PlayerFiles.root(context), json)
    val downloader = AssetDownloader(RetrofitDeviceApi.downloadClient())
    val waitingScreen = WaitingScreenStore(
        filesDir = PlayerFiles.root(context),
        downloader = downloader,
        json = json,
    )
    val display = ScreenDisplayStore(context)
    val syncProgress = SyncProgressStore()
    val telemetry = DeviceTelemetry(
        context = context,
        api = api,
        store = store,
        db = db,
        json = json,
        filesDir = PlayerFiles.root(context),
        appVersion = BuildConfig.VERSION_NAME,
        onAuthFailure = { code, source -> session.handleAuthFailure(code, source) },
    )
    val sync = PackageSyncCoordinator(
        api = api,
        store = store,
        packages = packages,
        downloader = downloader,
        filesDir = PlayerFiles.root(context),
        waitingScreen = waitingScreen,
        display = display,
        syncProgress = syncProgress,
        onActivated = { telemetry.noteSuccessfulSync() },
        onAuthFailure = { code, source -> session.handleAuthFailure(code, source) },
    )

    val apiConfigured: Boolean = apiBaseUrl.isNotBlank()
}
