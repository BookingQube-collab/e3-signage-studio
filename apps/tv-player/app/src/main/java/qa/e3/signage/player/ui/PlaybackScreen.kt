package qa.e3.signage.player.ui

import android.graphics.BitmapFactory
import android.net.Uri
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import qa.e3.signage.player.R
import qa.e3.signage.player.core.DisplayOrientation
import qa.e3.signage.player.core.FitMode
import qa.e3.signage.player.core.ITEM_TRANSITION_MS
import qa.e3.signage.player.core.ItemTransition
import qa.e3.signage.player.core.exoResizeMode
import qa.e3.signage.player.core.isInstant
import qa.e3.signage.player.core.parseItemTransition
import qa.e3.signage.player.core.requireLocalPlaybackUri
import java.io.File
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.LinkedHashMap

@Composable
fun PlaybackRoute(viewModel: PlaybackViewModel = viewModel()) {
    val state by viewModel.ui.collectAsStateWithLifecycle()
    PlaybackScreen(
        state = state,
        onVideoFinished = viewModel::onVideoFinished,
        onVideoReady = viewModel::onVideoReady,
        onContentReady = viewModel::onContentReady,
        onRequestRePair = { viewModel.requestRePair() },
    )
}

@Composable
fun PlaybackScreen(
    state: PlaybackUiState,
    onVideoFinished: (Int, Boolean) -> Unit,
    onVideoReady: (Int) -> Unit = {},
    onContentReady: (Int) -> Unit = {},
    onRequestRePair: () -> Unit = {},
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(parseHex(state.background))
            .pointerInput(Unit) {
                detectTapGestures(
                    onLongPress = { onRequestRePair() },
                )
            },
    ) {
        ImageSoundtrackPlayer(
            fileUri = if (state.playing) state.soundtrackUri else null,
            generation = state.soundtrackGeneration,
        )
        ScaledLayoutCanvas(
            layoutWidth = state.layoutWidth,
            layoutHeight = state.layoutHeight,
            zones = state.zones,
            timezone = state.timezone,
            onVideoFinished = onVideoFinished,
            onVideoReady = onVideoReady,
            onContentReady = onContentReady,
        )
        // Keep Downloading / waiting over the preparing player until first frame paints.
        // Do not gate on !playing — that caused the blank navy flash after early ACTIVE.
        if (state.waitingKind != null) {
            WaitingScreen(state.waitingKind, state.waitingOverrides, state.downloadProgress)
        }
    }
}

/**
 * Maps the published layout pixel canvas onto the oriented display frame with
 * **uniform contain/fit** (min scale) so authored aspect is preserved. Letterbox /
 * pillarbox bars are OK.
 *
 * Zone geometry is scaled in layout space (offset/size) — no oversized
 * `requiredSize` + `graphicsLayer` shrink (TCL clamped that path in 0.25–0.26).
 * When the canvas aspect matches the oriented frame (portrait 1080×1920), scale is
 * 1 and zones fill the entire viewport. Zone media still respects per-zone FitMode.
 */
@Composable
private fun ScaledLayoutCanvas(
    layoutWidth: Int,
    layoutHeight: Int,
    zones: List<ZoneUiState>,
    timezone: String,
    onVideoFinished: (Int, Boolean) -> Unit,
    onVideoReady: (Int) -> Unit,
    onContentReady: (Int) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val lw = layoutWidth.coerceAtLeast(1)
        val lh = layoutHeight.coerceAtLeast(1)
        val placed = DisplayOrientation.placedLayoutRect(
            layoutWidth = lw,
            layoutHeight = lh,
            frameWidthPx = constraints.maxWidth,
            frameHeightPx = constraints.maxHeight,
        )
        val density = LocalDensity.current
        val scale = placed.scale
        zones.forEach { zone ->
            key(zone.id) {
                val zX = placed.offsetXPx + (zone.x * scale).toInt()
                val zY = placed.offsetYPx + (zone.y * scale).toInt()
                val zW = (zone.width * scale).toInt().coerceAtLeast(1)
                val zH = (zone.height * scale).toInt().coerceAtLeast(1)
                Box(
                    modifier = Modifier
                        .offset { IntOffset(zX, zY) }
                        .size(
                            with(density) { zW.toDp() },
                            with(density) { zH.toDp() },
                        ),
                ) {
                    TransitioningZone(zone, timezone, onVideoFinished, onVideoReady, onContentReady)
                }
            }
        }
    }
}

private fun ZonePresentation.layerKey(): String = when (this) {
    is ZonePresentation.Video -> "v:$fileUri:$generation:$transition"
    is ZonePresentation.Image -> "i:$fileUri:$key:$generation:$transition"
    ZonePresentation.Clock -> "clock"
    ZonePresentation.Date -> "date"
    ZonePresentation.Empty -> "empty"
}

private fun ZonePresentation.itemTransition(): ItemTransition = when (this) {
    is ZonePresentation.Video -> parseItemTransition(transition)
    is ZonePresentation.Image -> parseItemTransition(transition)
    else -> ItemTransition.CUT
}

@Composable
private fun TransitioningZone(
    zone: ZoneUiState,
    timezone: String,
    onVideoFinished: (Int, Boolean) -> Unit,
    onVideoReady: (Int) -> Unit,
    onContentReady: (Int) -> Unit,
) {
    val presentation = zone.presentation
    var outgoing by remember { mutableStateOf<ZonePresentation?>(null) }
    var incoming by remember { mutableStateOf(presentation) }
    val progress = remember { Animatable(1f) }
    var readyGate by remember { mutableStateOf(CompletableDeferred(Unit)) }

    LaunchedEffect(presentation.layerKey()) {
        if (incoming.layerKey() == presentation.layerKey()) {
            incoming = presentation
            return@LaunchedEffect
        }
        val previous = incoming
        val effect = presentation.itemTransition()
        val previousIsVideo = previous is ZonePresentation.Video
        val nextIsVideo = presentation is ZonePresentation.Video
        // Hardware video decoders are scarce on TCL / signage SoCs. Keeping the
        // outgoing ExoPlayer alive during a FADE while preparing the next clip
        // deadlocks the second decoder → black screen on 2+ video playlists.
        if (previousIsVideo || nextIsVideo || effect.isInstant()) {
            outgoing = null
            incoming = presentation
            progress.snapTo(1f)
            return@LaunchedEffect
        }
        outgoing = previous
        val gate = CompletableDeferred<Unit>()
        readyGate = gate
        incoming = presentation
        progress.snapTo(0f)
        withTimeoutOrNull(2_500) { gate.await() }
        progress.animateTo(1f, tween(ITEM_TRANSITION_MS))
        outgoing = null
    }

    Box(Modifier.fillMaxSize().clipToBounds()) {
        val out = outgoing
        val t = progress.value
        val effect = incoming.itemTransition()
        if (out != null) {
            TransitionLayer(LayerRole.PREVIOUS, effect, t) {
                ZoneMedia(
                    out,
                    zone.fit,
                    timezone,
                    onVideoFinished,
                    onVideoReady,
                    onContentReady,
                    layerAlpha = layerAlpha(LayerRole.PREVIOUS, effect, t),
                    onReady = {},
                )
            }
        }
        TransitionLayer(LayerRole.CURRENT, effect, t) {
            ZoneMedia(
                incoming,
                zone.fit,
                timezone,
                onVideoFinished,
                onVideoReady,
                onContentReady,
                layerAlpha = layerAlpha(LayerRole.CURRENT, effect, t),
                onReady = { readyGate.complete(Unit) },
            )
        }
    }
}

private enum class LayerRole { CURRENT, PREVIOUS }

private fun layerAlpha(role: LayerRole, effect: ItemTransition, progress: Float): Float {
    val t = progress.coerceIn(0f, 1f)
    val incoming = role == LayerRole.CURRENT
    return when (effect) {
        ItemTransition.CUT -> if (incoming) 1f else 0f
        ItemTransition.FADE, ItemTransition.DISSOLVE, ItemTransition.ZOOM -> if (incoming) t else 1f - t
        ItemTransition.WIPE, ItemTransition.SLIDE, ItemTransition.SLIDE_RIGHT,
        ItemTransition.SLIDE_UP, ItemTransition.SLIDE_DOWN,
        -> 1f
    }
}

@Composable
private fun TransitionLayer(
    role: LayerRole,
    effect: ItemTransition,
    progress: Float,
    content: @Composable () -> Unit,
) {
    val t = progress.coerceIn(0f, 1f)
    val eased = 1f - (1f - t) * (1f - t) * (1f - t)
    val incoming = role == LayerRole.CURRENT
    val base = when {
        effect == ItemTransition.WIPE && incoming ->
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(t.coerceAtLeast(0.001f))
                .clipToBounds()
        else -> Modifier.fillMaxSize()
    }
    Box(
        modifier = base.graphicsLayer {
            when (effect) {
                ItemTransition.CUT -> alpha = if (incoming) 1f else 0f
                ItemTransition.FADE, ItemTransition.DISSOLVE -> alpha = if (incoming) t else 1f - t
                ItemTransition.SLIDE -> {
                    alpha = 1f
                    translationX = if (incoming) size.width * (1f - eased) else -size.width * eased
                }
                ItemTransition.SLIDE_RIGHT -> {
                    alpha = 1f
                    translationX = if (incoming) -size.width * (1f - eased) else size.width * eased
                }
                ItemTransition.SLIDE_UP -> {
                    alpha = 1f
                    translationY = if (incoming) size.height * (1f - eased) else -size.height * eased
                }
                ItemTransition.SLIDE_DOWN -> {
                    alpha = 1f
                    translationY = if (incoming) -size.height * (1f - eased) else size.height * eased
                }
                ItemTransition.ZOOM -> {
                    alpha = if (incoming) t else 1f - t
                    val s = if (incoming) 0.78f + 0.22f * t else 1f + 0.14f * t
                    scaleX = s
                    scaleY = s
                }
                ItemTransition.WIPE -> alpha = 1f
            }
        },
    ) {
        content()
    }
}

@Composable
private fun ZoneMedia(
    presentation: ZonePresentation,
    fit: FitMode,
    timezone: String,
    onVideoFinished: (Int, Boolean) -> Unit,
    onVideoReady: (Int) -> Unit,
    onContentReady: (Int) -> Unit,
    layerAlpha: Float,
    onReady: () -> Unit,
) {
    when (presentation) {
        is ZonePresentation.Video -> LocalVideoZone(
            fileUri = presentation.fileUri,
            key = presentation.key,
            generation = presentation.generation,
            loop = presentation.loop,
            fit = fit,
            layerAlpha = layerAlpha,
            onFinished = onVideoFinished,
            onDisplayReady = { onVideoReady(presentation.generation) },
            onTransitionReady = onReady,
        )
        is ZonePresentation.Image -> LocalImageZone(
            presentation.fileUri,
            fit,
            onReady = {
                onReady()
                onContentReady(presentation.generation)
            },
        )
        ZonePresentation.Clock -> {
            LaunchedEffect(Unit) { onReady() }
            ClockZone(timezone, "HH:mm")
        }
        ZonePresentation.Date -> {
            LaunchedEffect(Unit) { onReady() }
            ClockZone(timezone, "dd MMM yyyy")
        }
        ZonePresentation.Empty -> {
            LaunchedEffect(Unit) { onReady() }
            Box(Modifier.fillMaxSize())
        }
    }
}

@Composable
private fun ImageSoundtrackPlayer(fileUri: String?, generation: Int) {
    val context = LocalContext.current
    DisposableEffect(fileUri, generation) {
        if (fileUri.isNullOrBlank()) {
            return@DisposableEffect onDispose { }
        }
        val player = ExoPlayer.Builder(context).build().apply {
            val uri = Uri.parse(requireLocalPlaybackUri(fileUri).toString())
            setMediaItem(MediaItem.fromUri(uri))
            volume = 1f
            playWhenReady = true
            prepare()
        }
        onDispose { player.release() }
    }
}

@Composable
private fun LocalVideoZone(
    fileUri: String,
    key: String,
    generation: Int,
    loop: Boolean,
    fit: FitMode,
    layerAlpha: Float,
    onFinished: (Int, Boolean) -> Unit,
    onDisplayReady: () -> Unit,
    onTransitionReady: () -> Unit,
) {
    val context = LocalContext.current
    // Hold the player in a ref so AndroidView can bind after DisposableEffect creates it.
    // Create+release only inside DisposableEffect so the previous decoder is freed before
    // the next prepare() — critical on TCL where two concurrent ExoPlayers hang.
    val playerRef = remember { mutableStateOf<ExoPlayer?>(null) }
    DisposableEffect(key, generation, fileUri, loop) {
        val player = ExoPlayer.Builder(context).build().apply {
            val uri = Uri.parse(requireLocalPlaybackUri(fileUri).toString())
            setMediaItem(MediaItem.fromUri(uri))
            repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            playWhenReady = true
            prepare()
        }
        playerRef.value = player
        var displayReadySent = false
        var transitionReadySent = false
        fun markTransitionReady() {
            if (!transitionReadySent) {
                transitionReadySent = true
                onTransitionReady()
            }
        }
        fun markDisplayReady() {
            if (!displayReadySent) {
                displayReadySent = true
                onDisplayReady()
            }
        }
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY) {
                    markDisplayReady()
                }
                if (playbackState == Player.STATE_READY || playbackState == Player.STATE_ENDED) {
                    markTransitionReady()
                }
                if (!loop && playbackState == Player.STATE_ENDED) onFinished(generation, false)
            }

            override fun onPlayerError(error: PlaybackException) {
                // Do not treat errors as "display ready" — that revealed a blank shutter.
                markTransitionReady()
                if (!loop) onFinished(generation, true)
            }
        }
        player.addListener(listener)
        when (player.playbackState) {
            Player.STATE_READY -> {
                markDisplayReady()
                markTransitionReady()
            }
            Player.STATE_ENDED -> markTransitionReady()
        }
        onDispose {
            player.removeListener(listener)
            player.release()
            if (playerRef.value === player) {
                playerRef.value = null
            }
        }
    }
    val resize = when (exoResizeMode(fit)) {
        "FILL" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
        "ZOOM" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
    }
    val player = playerRef.value
    AndroidView(
        factory = { ctx ->
            (LayoutInflater.from(ctx).inflate(R.layout.player_texture, null, false) as PlayerView).apply {
                useController = false
                controllerAutoShow = false
                setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                setShutterBackgroundColor(android.graphics.Color.BLACK)
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
            }
        },
        update = { view ->
            view.player = player
            view.useController = false
            view.resizeMode = resize
            // OEMs often ignore Compose graphicsLayer alpha on TextureView — set view alpha too.
            view.alpha = layerAlpha.coerceIn(0f, 1f)
        },
        modifier = Modifier.fillMaxSize(),
    )
}

private object DecodedImageCache {
    private const val MAX = 16
    private val map = object : LinkedHashMap<String, android.graphics.Bitmap>(MAX, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, android.graphics.Bitmap>?): Boolean =
            size > MAX
    }

    @Synchronized
    fun get(path: String): android.graphics.Bitmap? = map[path]

    @Synchronized
    fun put(path: String, bitmap: android.graphics.Bitmap) {
        map[path] = bitmap
    }
}

@Composable
private fun LocalImageZone(fileUri: String, fit: FitMode, onReady: () -> Unit) {
    val path = remember(fileUri) {
        runCatching { File(requireLocalPlaybackUri(fileUri)).path }.getOrNull()
    }
    var bitmap by remember(fileUri) {
        mutableStateOf(path?.let { DecodedImageCache.get(it) })
    }
    LaunchedEffect(fileUri, path) {
        if (bitmap != null) {
            onReady()
            return@LaunchedEffect
        }
        val decoded = withContext(Dispatchers.IO) {
            val file = path?.let { File(it) } ?: return@withContext null
            if (!file.isFile) return@withContext null
            BitmapFactory.decodeFile(file.path)?.also { DecodedImageCache.put(file.path, it) }
        }
        bitmap = decoded
        onReady()
    }
    val image = bitmap
    if (image != null) {
        Image(
            bitmap = image.asImageBitmap(),
            contentDescription = null,
            contentScale = fit.toContentScale(),
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun ClockZone(timezone: String, pattern: String) {
    val zone = remember(timezone) { runCatching { ZoneId.of(timezone) }.getOrElse { ZoneId.of("UTC") } }
    val formatter = remember(pattern) { DateTimeFormatter.ofPattern(pattern) }
    var label by remember { mutableStateOf(ZonedDateTime.now(zone).format(formatter)) }
    LaunchedEffect(zone, pattern) {
        while (true) {
            label = ZonedDateTime.now(zone).format(formatter)
            delay(1_000)
        }
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = label, color = Color.White, fontFamily = SpaceGrotesk, fontSize = 28.sp)
    }
}

private fun FitMode.toContentScale(): ContentScale = when (this) {
    FitMode.STRETCH -> ContentScale.FillBounds
    FitMode.COVER, FitMode.FILL -> ContentScale.Crop
    FitMode.FIT, FitMode.CONTAIN -> ContentScale.Fit
}

private fun parseHex(value: String): Color {
    val hex = value.trim().removePrefix("#")
    val parsed = hex.toLongOrNull(16) ?: return Color.Black
    return when (hex.length) {
        6 -> Color(0xFF000000L or parsed)
        8 -> Color(parsed)
        else -> Color.Black
    }
}
