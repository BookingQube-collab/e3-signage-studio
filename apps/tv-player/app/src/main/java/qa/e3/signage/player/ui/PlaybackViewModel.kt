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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import qa.e3.signage.player.E3PlayerApplication
import qa.e3.signage.player.core.FitMode
import qa.e3.signage.player.core.HEARTBEAT_INTERVAL_MS
import qa.e3.signage.player.core.ContentPackageState
import qa.e3.signage.player.core.ManifestSchedule
import qa.e3.signage.player.core.OpenPlayback
import qa.e3.signage.player.core.PlaybackResult
import qa.e3.signage.player.core.PlaylistItemKind
import qa.e3.signage.player.core.PlaylistSequencer
import qa.e3.signage.player.core.ResolvedPlaylistItem
import qa.e3.signage.player.core.ScheduleEngine
import qa.e3.signage.player.core.ZonePlan
import qa.e3.signage.player.core.ZoneSource
import qa.e3.signage.player.core.completePlayback
import qa.e3.signage.player.core.hasPlayableLayoutContent
import qa.e3.signage.player.core.isPreparingNewerPackage
import qa.e3.signage.player.core.nextSyncPollDelayMs
import qa.e3.signage.player.core.planZones
import qa.e3.signage.player.core.resolvePlaylistItems
import qa.e3.signage.player.core.shouldHoldPlaybackWaiting
import qa.e3.signage.player.core.startPlayback
import qa.e3.signage.player.core.VIDEO_READY_TIMEOUT_MS
import qa.e3.signage.player.core.videoPlaybackSafetyTimeoutMs

data class PlaybackUiState(
    val playing: Boolean = false,
    /** True only after ExoPlayer/image has actually painted — not merely file-on-disk. */
    val contentDisplaying: Boolean = false,
    val background: String = "#000000",
    val layoutWidth: Int = 1920,
    val layoutHeight: Int = 1080,
    val zones: List<ZoneUiState> = emptyList(),
    val waitingKind: WaitingKind? = WaitingKind.FIRST_PUBLISH,
    val waitingOverrides: WaitingOverrides = WaitingOverrides(),
    val downloadProgress: DownloadProgressUi? = null,
    val timezone: String = "Asia/Qatar",
    val playingMediaId: String? = null,
    val soundtrackUri: String? = null,
    val soundtrackGeneration: Int = 0,
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
        val transition: String = "CUT",
    ) : ZonePresentation()
    data class Image(val fileUri: String, val key: String, val generation: Int = 0, val transition: String = "CUT") : ZonePresentation()
    data object Clock : ZonePresentation()
    data object Date : ZonePresentation()
    data object Empty : ZonePresentation()
}

class PlaybackViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as E3PlayerApplication
    private val packages = app.container.packages
    private val telemetry = app.container.telemetry
    private val _ui = MutableStateFlow(PlaybackUiState())
    val ui: StateFlow<PlaybackUiState> = _ui

    @Volatile
    var videoFinished: CompletableDeferred<Unit> = CompletableDeferred()
        private set

    @Volatile
    private var videoReady: CompletableDeferred<Unit> = CompletableDeferred()

    @Volatile
    private var videoFailed = false

    @Volatile
    private var openPlay: OpenPlayback? = null

    init {
        viewModelScope.launch { playLoop() }
        viewModelScope.launch { pollLoop() }
        viewModelScope.launch { heartbeatLoop() }
        viewModelScope.launch { resumeWhenOnline() }
        viewModelScope.launch {
            app.container.waitingScreen.state.collect { waiting ->
                val overrides = WaitingOverrides(
                    brand = waiting.brand,
                    localImagePath = waiting.localImagePath,
                    localBrandIconPath = waiting.localBrandIconPath,
                    localLogoPath = waiting.localLogoPath,
                    title = waiting.title,
                    message = waiting.message,
                )
                val current = _ui.value
                if (current.waitingOverrides != overrides) {
                    _ui.value = current.copy(waitingOverrides = overrides)
                }
            }
        }
        viewModelScope.launch {
            app.container.syncProgress.state.collect { progress ->
                val progressUi = when {
                    progress.isBusy || progress.isFailed -> DownloadProgressUi(
                        percent = progress.percent,
                        filesDone = progress.filesDone,
                        filesTotal = progress.filesTotal,
                        currentFile = progress.currentFile,
                        error = progress.error,
                        failed = progress.isFailed,
                    )
                    else -> null
                }
                val current = _ui.value
                when {
                    progress.isFailed && !current.contentDisplaying -> {
                        _ui.value = current.copy(
                            waitingKind = WaitingKind.DOWNLOAD_FAILED,
                            downloadProgress = progressUi,
                            contentDisplaying = false,
                        )
                    }
                    progress.isBusy && !current.contentDisplaying -> {
                        _ui.value = current.copy(
                            waitingKind = WaitingKind.LOADING_CONTENT,
                            downloadProgress = progressUi,
                        )
                    }
                    else -> {
                        if (current.downloadProgress != progressUi) {
                            _ui.value = current.copy(downloadProgress = progressUi)
                        }
                    }
                }
            }
        }
    }

    @Volatile
    private var videoGeneration = 0

    @Volatile
    private var soundtrackGeneration = 0

    fun onVideoReady(generation: Int) {
        if (generation == videoGeneration) {
            videoReady.complete(Unit)
            revealContent()
        }
    }

    /** Image (or layout static) finished decoding and is on screen. */
    fun onContentReady(generation: Int) {
        if (generation == videoGeneration) {
            revealContent()
        }
    }

    fun onVideoFinished(generation: Int, failed: Boolean = false) {
        if (generation == videoGeneration) {
            videoFailed = failed
            videoReady.complete(Unit)
            videoFinished.complete(Unit)
            if (failed) {
                showPlaybackProblem(WaitingKind.PLAYBACK_ERROR)
            }
        }
    }

    private fun revealContent() {
        val current = _ui.value
        if (current.contentDisplaying && current.waitingKind == null) return
        _ui.value = current.copy(
            waitingKind = null,
            contentDisplaying = true,
            // Hide download chrome once something is painting; remaining files continue in background.
            downloadProgress = null,
        )
    }

    /** Cover the canvas after a decode/timeout failure — never leave a blank navy frame. */
    private fun showPlaybackProblem(kind: WaitingKind = WaitingKind.PLAYBACK_ERROR) {
        val progress = app.container.syncProgress.state.value
        val waiting = when {
            progress.isFailed -> WaitingKind.DOWNLOAD_FAILED
            progress.isBusy -> WaitingKind.LOADING_CONTENT
            else -> kind
        }
        _ui.value = _ui.value.copy(
            waitingKind = waiting,
            downloadProgress = currentDownloadProgressUi(),
            contentDisplaying = false,
            playing = false,
        )
    }

    /** Long-press on the TV clears credentials so Repair can show a new pairing code. */
    fun requestRePair() {
        app.container.session.invalidate("user long-press re-pair")
    }

    private suspend fun playLoop() {
        while (viewModelScope.isActive) {
            val loaded = packages.loadActive()
            val waitingOverrides = waitingOverrides()
            if (loaded == null) {
                closeOpenPlay(PlaybackResult.INTERRUPTED)
                _ui.value = PlaybackUiState(
                    waitingKind = waitingKindWhilePreparing(),
                    waitingOverrides = waitingOverrides,
                    downloadProgress = currentDownloadProgressUi(),
                    contentDisplaying = false,
                )
                withTimeoutOrNull(2_000) { app.container.sync.activations.first() }
                continue
            }
            val (manifest, root) = loaded
            // Re-apply package orientation each loop so a mid-session CMS change sticks
            // even if sync-status was missed (activate path also writes the store).
            app.container.display.applyFromSync(manifest.orientation, manifest.width, manifest.height)
            val plan = planZones(
                manifest,
                root,
                canvasWidth = app.container.display.canvasWidth.value,
                canvasHeight = app.container.display.canvasHeight.value,
            )
            val activeSchedule = ScheduleEngine.selectActive(manifest.schedules)
            val tz = activeSchedule?.timezone
                ?: manifest.schedules.firstOrNull()?.timezone
                ?: "Asia/Qatar"
            if (!ScheduleEngine.shouldPlay(manifest.schedules)) {
                closeOpenPlay(PlaybackResult.INTERRUPTED)
                _ui.value = PlaybackUiState(
                    playing = false,
                    contentDisplaying = false,
                    background = plan.background,
                    waitingKind = WaitingKind.OFF_HOURS,
                    waitingOverrides = waitingOverrides,
                    timezone = tz,
                )
                delay(15_000)
                continue
            }
            val items = resolvePlaylistItems(manifest.playlist, manifest.assets, root)
            val sequencer = PlaylistSequencer(items, manifest.playlist?.loop ?: true)
            if (sequencer.isEmpty()) {
                closeOpenPlay(PlaybackResult.INTERRUPTED)
                if (hasPlayableLayoutContent(plan)) {
                    _ui.value = buildUi(plan, null, tz, videoGeneration, soundtrackGeneration)
                        .copy(contentDisplaying = true, waitingKind = null)
                    holdLayoutUntilChange(manifest.schedules, manifest.manifestVersion, plan.background, tz)
                    continue
                }
                _ui.value = PlaybackUiState(
                    playing = false,
                    contentDisplaying = false,
                    background = plan.background,
                    waitingKind = waitingKindWhilePreparing(fallback = WaitingKind.EMPTY_PLAYLIST),
                    waitingOverrides = waitingOverrides,
                    downloadProgress = currentDownloadProgressUi(),
                    timezone = tz,
                )
                withTimeoutOrNull(2_000) { app.container.sync.activations.first() }
                continue
            }
            while (viewModelScope.isActive && ScheduleEngine.shouldPlay(manifest.schedules)) {
                if (packages.activeVersion() != manifest.manifestVersion) {
                    closeOpenPlay(PlaybackResult.INTERRUPTED)
                    break
                }
                if (isPreparingNewerPackage(
                        packages.cloudManifestVersion(),
                        manifest.manifestVersion,
                        packages.currentPackageState(),
                    )
                ) {
                    closeOpenPlay(PlaybackResult.INTERRUPTED)
                    _ui.value = PlaybackUiState(
                        playing = false,
                        contentDisplaying = false,
                        background = plan.background,
                        waitingKind = WaitingKind.LOADING_CONTENT,
                        waitingOverrides = waitingOverrides(),
                        downloadProgress = currentDownloadProgressUi(),
                        timezone = tz,
                    )
                    withTimeoutOrNull(2_000) { app.container.sync.activations.first() }
                    break
                }
                val item = sequencer.current() ?: break
                if (item.kind == PlaylistItemKind.VIDEO) {
                    videoGeneration += 1
                    videoFailed = false
                    videoReady = CompletableDeferred()
                    videoFinished = CompletableDeferred()
                } else {
                    // Images share the generation counter so onContentReady can reveal.
                    videoGeneration += 1
                }
                openPlay = startPlayback(
                    item,
                    campaignId = ScheduleEngine.selectActive(manifest.schedules)?.campaignId,
                    playlistId = manifest.playlist?.id,
                )
                if (item.kind == PlaylistItemKind.IMAGE && !item.audioFileUri.isNullOrBlank()) {
                    soundtrackGeneration += 1
                }
                _ui.value = uiForStartingItem(plan, item, tz, videoGeneration, soundtrackGeneration)
                val result = when (item.kind) {
                    PlaylistItemKind.IMAGE -> {
                        awaitItemHold(
                            (item.durationSeconds * 1000).toLong().coerceAtLeast(100L),
                            manifest.manifestVersion,
                        )
                    }
                    PlaylistItemKind.VIDEO -> awaitVideoItem(item, manifest.manifestVersion)
                }
                closeOpenPlay(result)
                // Failed clips must not freeze the loop — show error briefly, then skip.
                if (result == PlaybackResult.ERROR) {
                    Log.w(TAG, "video error; skipping ${item.localFilename}")
                    if (_ui.value.waitingKind == null || _ui.value.contentDisplaying) {
                        showPlaybackProblem(WaitingKind.PLAYBACK_ERROR)
                    }
                    delay(1_200)
                }
                if (packages.activeVersion() != manifest.manifestVersion) {
                    break
                }
                if (shouldShowLoadingForNewerPackage(manifest.manifestVersion)) {
                    _ui.value = PlaybackUiState(
                        playing = false,
                        contentDisplaying = false,
                        background = plan.background,
                        waitingKind = WaitingKind.LOADING_CONTENT,
                        waitingOverrides = waitingOverrides(),
                        downloadProgress = currentDownloadProgressUi(),
                        timezone = tz,
                    )
                    withTimeoutOrNull(2_000) { app.container.sync.activations.first() }
                    break
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

    /**
     * Start zones under the waiting overlay when nothing has painted yet.
     * Never clear Waiting until [revealContent] (first rendered frame / image decoded).
     */
    private fun uiForStartingItem(
        plan: ZonePlan,
        item: ResolvedPlaylistItem,
        timezone: String,
        videoGeneration: Int,
        soundtrackGeneration: Int,
    ): PlaybackUiState {
        val base = buildUi(plan, item, timezone, videoGeneration, soundtrackGeneration)
        val progress = app.container.syncProgress.state.value
        val current = _ui.value
        val hold = shouldHoldPlaybackWaiting(
            contentDisplaying = current.contentDisplaying,
            downloadBusy = progress.isBusy,
            downloadFailed = progress.isFailed,
            alreadyWaiting = current.waitingKind != null,
        )
        if (!hold) {
            // Prior clip already painted — seamless handoff, no waiting flash.
            return base.copy(contentDisplaying = true, waitingKind = null, downloadProgress = null)
        }
        val kind = when {
            progress.isFailed -> WaitingKind.DOWNLOAD_FAILED
            progress.isBusy -> WaitingKind.LOADING_CONTENT
            current.waitingKind == WaitingKind.PLAYBACK_ERROR -> WaitingKind.PLAYBACK_ERROR
            current.waitingKind == WaitingKind.LOADING_CONTENT -> WaitingKind.LOADING_CONTENT
            current.waitingKind == WaitingKind.DOWNLOAD_FAILED -> WaitingKind.DOWNLOAD_FAILED
            else -> WaitingKind.LOADING_CONTENT
        }
        return base.copy(
            contentDisplaying = false,
            waitingKind = kind,
            waitingOverrides = waitingOverrides(),
            downloadProgress = currentDownloadProgressUi(),
        )
    }

    private suspend fun shouldShowLoadingForNewerPackage(activeVersion: Int): Boolean =
        isPreparingNewerPackage(
            packages.cloudManifestVersion(),
            activeVersion,
            packages.currentPackageState(),
        )

    private suspend fun holdLayoutUntilChange(
        schedules: List<ManifestSchedule>,
        activeVersion: Int,
        background: String,
        timezone: String,
    ) {
        while (viewModelScope.isActive && ScheduleEngine.shouldPlay(schedules)) {
            if (packages.activeVersion() != activeVersion) return
            if (shouldShowLoadingForNewerPackage(activeVersion)) {
                _ui.value = PlaybackUiState(
                    playing = false,
                    contentDisplaying = false,
                    background = background,
                    waitingKind = WaitingKind.LOADING_CONTENT,
                    waitingOverrides = waitingOverrides(),
                    downloadProgress = currentDownloadProgressUi(),
                    timezone = timezone,
                )
                withTimeoutOrNull(2_000) { app.container.sync.activations.first() }
                return
            }
            delay(2_000)
        }
    }

    private suspend fun awaitItemHold(totalMs: Long, activeVersion: Int): PlaybackResult {
        var waited = 0L
        while (waited < totalMs) {
            if (shouldShowLoadingForNewerPackage(activeVersion)) return PlaybackResult.INTERRUPTED
            if (packages.activeVersion() != activeVersion) return PlaybackResult.INTERRUPTED
            val slice = minOf(2_000L, totalMs - waited)
            delay(slice)
            waited += slice
        }
        return PlaybackResult.COMPLETED
    }

    /**
     * Videos play to natural end (or error). Playlist duration is not a trim cap —
     * that caused 10s restarts ("plays fast") and premature advances into a second
     * ExoPlayer while the first decoder was still held.
     */
    private suspend fun awaitVideoItem(
        item: ResolvedPlaylistItem,
        activeVersion: Int,
    ): PlaybackResult {
        val ready = withTimeoutOrNull(VIDEO_READY_TIMEOUT_MS) {
            while (!videoReady.isCompleted) {
                if (shouldShowLoadingForNewerPackage(activeVersion)) return@withTimeoutOrNull null
                if (packages.activeVersion() != activeVersion) return@withTimeoutOrNull null
                withTimeoutOrNull(1_000) { videoReady.await() }
            }
            Unit
        }
        if (shouldShowLoadingForNewerPackage(activeVersion) || packages.activeVersion() != activeVersion) {
            return PlaybackResult.INTERRUPTED
        }
        if (ready == null && !videoFinished.isCompleted) {
            Log.w(TAG, "video not ready in ${VIDEO_READY_TIMEOUT_MS}ms: ${item.localFilename}")
            videoFailed = true
            showPlaybackProblem(WaitingKind.PLAYBACK_ERROR)
            return PlaybackResult.ERROR
        }
        if (videoFailed || videoFinished.isCompleted) {
            return if (videoFailed) PlaybackResult.ERROR else PlaybackResult.COMPLETED
        }

        val safety = videoPlaybackSafetyTimeoutMs(item.durationSeconds)
        val ended = withTimeoutOrNull(safety) {
            while (!videoFinished.isCompleted) {
                if (shouldShowLoadingForNewerPackage(activeVersion)) {
                    return@withTimeoutOrNull null
                }
                if (packages.activeVersion() != activeVersion) {
                    return@withTimeoutOrNull null
                }
                withTimeoutOrNull(2_000) { videoFinished.await() }
            }
            Unit
        }
        return when {
            shouldShowLoadingForNewerPackage(activeVersion) ||
                packages.activeVersion() != activeVersion -> PlaybackResult.INTERRUPTED
            videoFailed -> PlaybackResult.ERROR
            ended == null -> {
                Log.w(TAG, "video safety timeout: ${item.localFilename}")
                showPlaybackProblem(WaitingKind.PLAYBACK_ERROR)
                PlaybackResult.ERROR
            }
            else -> PlaybackResult.COMPLETED
        }
    }

    private suspend fun waitingKindWhilePreparing(
        fallback: WaitingKind = WaitingKind.FIRST_PUBLISH,
    ): WaitingKind {
        val state = packages.currentPackageState()
        return when (state) {
            ContentPackageState.PENDING,
            ContentPackageState.DOWNLOADING,
            ContentPackageState.VERIFYING,
            ContentPackageState.READY,
            -> WaitingKind.LOADING_CONTENT
            ContentPackageState.FAILED -> WaitingKind.DOWNLOAD_FAILED
            else -> fallback
        }
    }

    private suspend fun closeOpenPlay(result: PlaybackResult) {
        val open = openPlay ?: return
        openPlay = null
        try {
            telemetry.recordPlayback(completePlayback(open, result))
        } catch (error: Exception) {
            Log.w(TAG, "proof-of-play: ${error.message}")
        }
    }

    private fun currentDownloadProgressUi(): DownloadProgressUi? {
        val progress = app.container.syncProgress.state.value
        if (!progress.isBusy && !progress.isFailed) return null
        return DownloadProgressUi(
            percent = progress.percent,
            filesDone = progress.filesDone,
            filesTotal = progress.filesTotal,
            currentFile = progress.currentFile,
            error = progress.error,
            failed = progress.isFailed,
        )
    }

    private fun waitingOverrides(): WaitingOverrides {
        val waiting = app.container.waitingScreen.state.value
        return WaitingOverrides(
            brand = waiting.brand,
            localImagePath = waiting.localImagePath,
            localBrandIconPath = waiting.localBrandIconPath,
            localLogoPath = waiting.localLogoPath,
            title = waiting.title,
            message = waiting.message,
        )
    }

    private fun buildUi(
        plan: ZonePlan,
        item: ResolvedPlaylistItem?,
        timezone: String,
        videoGeneration: Int,
        soundtrackGeneration: Int,
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
                        ZonePresentation.Image(source.fileUri, source.fileUri, generation = 0)
                    }
                    ZoneSource.Clock -> ZonePresentation.Clock
                    ZoneSource.Date -> ZonePresentation.Date
                    ZoneSource.Empty -> ZonePresentation.Empty
                },
            )
        }
        return PlaybackUiState(
            playing = true,
            contentDisplaying = false,
            background = plan.background,
            layoutWidth = plan.layoutWidth,
            layoutHeight = plan.layoutHeight,
            zones = zones,
            waitingKind = null,
            timezone = timezone,
            playingMediaId = item?.mediaId,
            soundtrackUri = if (item?.kind == PlaylistItemKind.IMAGE) item.audioFileUri else null,
            soundtrackGeneration = soundtrackGeneration,
        )
    }

    private fun presentationFor(item: ResolvedPlaylistItem?, videoGeneration: Int): ZonePresentation {
        if (item == null) return ZonePresentation.Empty
        return if (item.kind == PlaylistItemKind.VIDEO) {
            ZonePresentation.Video(
                fileUri = item.fileUri,
                key = item.mediaId + item.fileUri,
                generation = videoGeneration,
                loop = false,
                transition = item.transition,
            )
        } else {
            ZonePresentation.Image(item.fileUri, item.mediaId + item.fileUri, videoGeneration, item.transition)
        }
    }

    private suspend fun pollLoop() {
        while (viewModelScope.isActive) {
            pollSyncStatus()
            delay(nextSyncPollDelayMs(playing = _ui.value.playing))
        }
    }

    private suspend fun heartbeatLoop() {
        pingHeartbeat()
        while (viewModelScope.isActive) {
            delay(HEARTBEAT_INTERVAL_MS)
            pingHeartbeat()
        }
    }

    private suspend fun resumeWhenOnline() {
        connectivityFlow(getApplication()).distinctUntilChanged().drop(1).collect { online ->
            if (online) {
                pollSyncStatus()
                pingHeartbeat()
            }
        }
    }

    private suspend fun pingHeartbeat() {
        try {
            val loaded = packages.loadActive()
            telemetry.sendHeartbeat(
                playingMediaId = _ui.value.playingMediaId,
                playlistId = loaded?.first?.playlist?.id,
                manifestVersion = loaded?.first?.manifestVersion,
                packageState = packages.currentPackageState(),
                lastError = packages.lastError(),
            )
        } catch (error: Exception) {
            Log.w(TAG, "heartbeat: ${error.message}")
        }
    }

    private suspend fun pollSyncStatus() {
        try {
            app.container.sync.syncIfNeeded()
        } catch (error: Exception) {
            Log.w(TAG, "sync: ${error.message}")
            try {
                telemetry.recordError("SYNC", error.message ?: "Sync failed")
            } catch (_: Exception) {
            }
        }
    }

    private companion object {
        const val TAG = "E3Sync"
    }
}
