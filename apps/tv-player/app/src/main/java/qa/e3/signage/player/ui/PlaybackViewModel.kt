package qa.e3.signage.player.ui

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import qa.e3.signage.player.E3PlayerApplication
import qa.e3.signage.player.core.FitMode
import qa.e3.signage.player.core.PlaylistItemKind
import qa.e3.signage.player.core.PlaylistSequencer
import qa.e3.signage.player.core.ResolvedPlaylistItem
import qa.e3.signage.player.core.ScheduleEngine
import qa.e3.signage.player.core.ZonePlan
import qa.e3.signage.player.core.ZoneSource
import qa.e3.signage.player.core.planZones
import qa.e3.signage.player.core.resolvePlaylistItems

data class PlaybackUiState(
    val playing: Boolean = false,
    val background: String = "#000000",
    val layoutWidth: Int = 1920,
    val layoutHeight: Int = 1080,
    val zones: List<ZoneUiState> = emptyList(),
    val waitingMessage: String? = "Waiting for published content",
    val timezone: String = "Asia/Qatar",
    val playingMediaId: String? = null,
)

data class ZoneUiState(
    val id: String,
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val fit: FitMode,
    val presentation: ZonePresentation,
)

sealed class ZonePresentation {
    data class Video(
        val fileUri: String,
        val key: String,
        val generation: Int,
        val loop: Boolean = false,
    ) : ZonePresentation()
    data class Image(val fileUri: String, val key: String) : ZonePresentation()
    data object Clock : ZonePresentation()
    data object Date : ZonePresentation()
    data object Empty : ZonePresentation()
}

class PlaybackViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as E3PlayerApplication
    private val packages = app.container.packages
    private val _ui = MutableStateFlow(PlaybackUiState())
    val ui: StateFlow<PlaybackUiState> = _ui

    @Volatile
    var videoFinished: CompletableDeferred<Unit> = CompletableDeferred()
        private set

    init {
        viewModelScope.launch { playLoop() }
        viewModelScope.launch { pollLoop() }
        viewModelScope.launch { resumeWhenOnline() }
    }

    @Volatile
    private var videoGeneration = 0

    fun onVideoFinished(generation: Int) {
        if (generation == videoGeneration) videoFinished.complete(Unit)
    }

    private suspend fun playLoop() {
        while (viewModelScope.isActive) {
            val loaded = packages.loadActive()
            if (loaded == null) {
                _ui.value = PlaybackUiState(waitingMessage = "Waiting for published content")
                withTimeoutOrNull(15_000) { app.container.sync.activations.first() }
                continue
            }
            val (manifest, root) = loaded
            val metrics = app.resources.displayMetrics
            val plan = planZones(manifest, root, metrics.widthPixels, metrics.heightPixels)
            val tz = ScheduleEngine.selectActive(manifest.schedules)?.timezone
                ?: manifest.schedules.firstOrNull()?.timezone
                ?: "Asia/Qatar"
            if (!ScheduleEngine.shouldPlay(manifest.schedules)) {
                _ui.value = PlaybackUiState(
                    playing = false,
                    background = plan.background,
                    waitingMessage = null,
                    timezone = tz,
                )
                delay(15_000)
                continue
            }
            val items = resolvePlaylistItems(manifest.playlist, manifest.assets, root)
            val sequencer = PlaylistSequencer(items, manifest.playlist?.loop ?: true)
            if (sequencer.isEmpty()) {
                _ui.value = buildUi(plan, null, tz, videoGeneration)
                delay(15_000)
                continue
            }
            while (viewModelScope.isActive && ScheduleEngine.shouldPlay(manifest.schedules)) {
                if (packages.activeVersion() != manifest.manifestVersion) break
                val item = sequencer.current() ?: break
                if (item.kind == PlaylistItemKind.VIDEO) {
                    videoGeneration += 1
                    videoFinished = CompletableDeferred()
                }
                _ui.value = buildUi(plan, item, tz, videoGeneration)
                when (item.kind) {
                    PlaylistItemKind.IMAGE -> delay((item.durationSeconds * 1000).toLong().coerceAtLeast(100L))
                    PlaylistItemKind.VIDEO -> {
                        val cap = (item.durationSeconds * 1000).toLong().coerceAtLeast(250L)
                        withTimeoutOrNull(cap) { videoFinished.await() }
                    }
                }
                if (sequencer.advance() == null) {
                    while (viewModelScope.isActive && ScheduleEngine.shouldPlay(manifest.schedules)) {
                        delay(15_000)
                    }
                    break
                }
            }
        }
    }

    private fun buildUi(
        plan: ZonePlan,
        item: ResolvedPlaylistItem?,
        timezone: String,
        videoGeneration: Int,
    ): PlaybackUiState {
        val zones = plan.zones.map { zone ->
            ZoneUiState(
                id = zone.id,
                x = zone.rect.x,
                y = zone.rect.y,
                width = zone.rect.width,
                height = zone.rect.height,
                fit = zone.fit,
                presentation = when (val source = zone.source) {
                    is ZoneSource.Playlist -> presentationFor(item, videoGeneration)
                    is ZoneSource.StaticFile -> if (source.kind == PlaylistItemKind.VIDEO) {
                        ZonePresentation.Video(source.fileUri, source.fileUri, generation = 0, loop = true)
                    } else {
                        ZonePresentation.Image(source.fileUri, source.fileUri)
                    }
                    ZoneSource.Clock -> ZonePresentation.Clock
                    ZoneSource.Date -> ZonePresentation.Date
                    ZoneSource.Empty -> ZonePresentation.Empty
                },
            )
        }
        return PlaybackUiState(
            playing = true,
            background = plan.background,
            layoutWidth = plan.layoutWidth,
            layoutHeight = plan.layoutHeight,
            zones = zones,
            waitingMessage = null,
            timezone = timezone,
            playingMediaId = item?.mediaId,
        )
    }

    private fun presentationFor(item: ResolvedPlaylistItem?, videoGeneration: Int): ZonePresentation {
        if (item == null) return ZonePresentation.Empty
        return if (item.kind == PlaylistItemKind.VIDEO) {
            ZonePresentation.Video(item.fileUri, item.mediaId + item.fileUri, videoGeneration, loop = false)
        } else {
            ZonePresentation.Image(item.fileUri, item.mediaId + item.fileUri)
        }
    }

    private suspend fun pollLoop() {
        while (viewModelScope.isActive) {
            pollSyncStatus()
            delay(120_000)
        }
    }

    private suspend fun resumeWhenOnline() {
        connectivityFlow(getApplication()).distinctUntilChanged().drop(1).collect { online ->
            if (online) pollSyncStatus()
        }
    }

    private suspend fun pollSyncStatus() {
        try {
            app.container.sync.syncIfNeeded()
        } catch (error: Exception) {
            Log.w(TAG, "sync: ${error.message}")
        }
    }

    private companion object {
        const val TAG = "E3Sync"
    }
}
