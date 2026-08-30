package qa.e3.signage.player.ui

import android.app.Application
import android.os.Build
import android.util.DisplayMetrics
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import qa.e3.signage.player.BuildConfig
import qa.e3.signage.player.E3PlayerApplication
import qa.e3.signage.player.core.PairingEvent
import qa.e3.signage.player.data.DeviceConfigEntity
import qa.e3.signage.player.data.HeartbeatWorker
import qa.e3.signage.player.data.SyncStatusWorker
import qa.e3.signage.player.data.WaitingScreenState

data class PairingUiState(
    val groupedCode: String = "••• •••",
    val connected: Boolean = true,
    val message: String = "Requesting a pairing code…",
    val error: String? = null,
    val paired: Boolean = false,
)

class PairingViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as E3PlayerApplication
    private val _ui = MutableStateFlow(PairingUiState())
    val ui: StateFlow<PairingUiState> = _ui

    private val _branding = MutableStateFlow(app.container.waitingScreen.state.value)
    val branding: StateFlow<WaitingScreenState> = _branding.asStateFlow()

    init {
        viewModelScope.launch {
            connectivityFlow(app).collect { online ->
                _ui.update { it.copy(connected = online) }
            }
        }
        viewModelScope.launch {
            app.container.waitingScreen.state.collect { cached ->
                _branding.value = cached
            }
        }
        viewModelScope.launch { refreshPublicBranding() }
        viewModelScope.launch { startPairing() }
    }

    private suspend fun refreshPublicBranding() {
        if (!app.container.apiConfigured) return
        try {
            val response = withContext(Dispatchers.IO) {
                app.container.api.playerBranding()
            }
            withContext(Dispatchers.IO) {
                app.container.waitingScreen.applyPublicBranding(
                    waiting = response.waitingScreen,
                    logo = response.logo,
                )
            }
        } catch (error: Exception) {
            Log.w(TAG, "public branding: ${error.message}")
        }
    }

    private suspend fun startPairing() {
        if (!app.container.apiConfigured) {
            _ui.update {
                it.copy(error = "Set api.base.url in local.properties to the CMS host.")
            }
            return
        }
        val metrics: DisplayMetrics = app.resources.displayMetrics
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        val orientation = if (width >= height) "LANDSCAPE" else "PORTRAIT"
        app.container.pairing.run(
            appVersion = BuildConfig.VERSION_NAME,
            deviceName = Build.MODEL,
            orientation = orientation,
            width = width,
            height = height,
        ) { event ->
            when (event) {
                PairingEvent.RequestingCode ->
                    _ui.update { it.copy(message = "Requesting a pairing code…", error = null) }
                is PairingEvent.CodeReady ->
                    _ui.update {
                        it.copy(
                            groupedCode = event.grouped,
                            message = "Enter this code in the E3 CMS",
                            error = null,
                        )
                    }
                PairingEvent.WaitingForCms ->
                    _ui.update { it.copy(message = "Enter this code in the E3 CMS", error = null) }
                is PairingEvent.Failed ->
                    _ui.update {
                        val stillWaiting = it.groupedCode.contains('•')
                        it.copy(
                            error = event.message,
                            message = if (stillWaiting) {
                                "Retrying pairing code request…"
                            } else {
                                it.message
                            },
                        )
                    }
                is PairingEvent.Paired -> {
                    app.container.db.deviceConfigDao().upsert(
                        DeviceConfigEntity(
                            deviceId = event.deviceId,
                            screenId = event.screenId,
                            apiBaseUrl = app.container.apiBaseUrl,
                            appVersion = BuildConfig.VERSION_NAME,
                            pairedAt = System.currentTimeMillis(),
                        ),
                    )
                    SyncStatusWorker.enqueue(app)
                    HeartbeatWorker.enqueue(app)
                    _ui.update { it.copy(paired = true, error = null, message = "Paired") }
                }
            }
        }
    }

    private companion object {
        const val TAG = "E3Pairing"
    }
}
