package qa.e3.signage.player.ui

import android.graphics.BitmapFactory
import android.net.Uri
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
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
    PlaybackScreen(state, onVideoFinished = viewModel::onVideoFinished)
}

@Composable
fun PlaybackScreen(state: PlaybackUiState, onVideoFinished: (Int, Boolean) -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(parseHex(state.background)),
    ) {
        ImageSoundtrackPlayer(
            fileUri = if (state.playing) state.soundtrackUri else null,
            generation = state.soundtrackGeneration,
        )
        if (!state.playing && state.waitingKind != null) {
            WaitingScreen(state.waitingKind, state.waitingOverrides)
        }
        ScaledLayoutCanvas(
            layoutWidth = state.layoutWidth,
            layoutHeight = state.layoutHeight,
        ) {
            state.zones.forEach { zone ->
                key(zone.id) {
                    val density = LocalDensity.current
                    val widthDp = with(density) { zone.width.toDp() }
                    val heightDp = with(density) { zone.height.toDp() }
                    Box(
                        modifier = Modifier
                            .offset { IntOffset(zone.x, zone.y) }
                            .size(widthDp, heightDp),
                    ) {
                        TransitioningZone(zone, state.timezone, onVideoFinished)
                    }
                }
            }
        }
    }
}

/**
 * Maps the published layout pixel canvas onto the oriented display frame so zones
 * fill portrait/landscape mounts instead of sitting as a tiny centered letterbox.
 */
@Composable
private fun ScaledLayoutCanvas(
    layoutWidth: Int,
    layoutHeight: Int,
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val lw = layoutWidth.coerceAtLeast(1)
        val lh = layoutHeight.coerceAtLeast(1)
        val scale = minOf(
            constraints.maxWidth / lw.toFloat(),
            constraints.maxHeight / lh.toFloat(),
        )
        val density = LocalDensity.current
        Box(
            Modifier
                .align(Alignment.Center)
                .size(
                    with(density) { lw.toDp() },
                    with(density) { lh.toDp() },
                )
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    transformOrigin = TransformOrigin.Center
                },
        ) {
            content()
        }
    }
}

private fun ZonePresentation.layerKey(): String = when (this) {
    is ZonePresentation.Video -> "v:$fileUri:$generation:$transition"
    is ZonePresentation.Image -> "i:$fileUri:$key:$transition"
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
private fun TransitioningZone(zone: ZoneUiState, timezone: String, onVideoFinished: (Int, Boolean) -> Unit) {
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
        outgoing = incoming
        val gate = CompletableDeferred<Unit>()
        readyGate = gate
        incoming = presentation
        val effect = presentation.itemTransition()
        if (effect.isInstant() || outgoing == null) {
            progress.snapTo(1f)
            outgoing = null
            return@LaunchedEffect
        }
        // Hold previous frame until incoming image/video has something to show.
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
                ZoneMedia(out, zone.fit, timezone, onVideoFinished, layerAlpha = layerAlpha(LayerRole.PREVIOUS, effect, t), onReady = {})
            }
        }
        TransitionLayer(LayerRole.CURRENT, effect, t) {
            ZoneMedia(
                incoming,
                zone.fit,
                timezone,
                onVideoFinished,
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
            onReady = onReady,
        )
        is ZonePresentation.Image -> LocalImageZone(presentation.fileUri, fit, onReady)
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
    onReady: () -> Unit,
) {
    val context = LocalContext.current
    val player = remember(key, generation) {
        ExoPlayer.Builder(context).build().apply {
            val uri = Uri.parse(requireLocalPlaybackUri(fileUri).toString())
            setMediaItem(MediaItem.fromUri(uri))
            repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            playWhenReady = true
            prepare()
        }
    }
    DisposableEffect(player, generation) {
        var readySent = false
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (!readySent &&
                    (playbackState == Player.STATE_READY || playbackState == Player.STATE_ENDED)
                ) {
                    readySent = true
                    onReady()
                }
                if (!loop && playbackState == Player.STATE_ENDED) onFinished(generation, false)
            }

            override fun onPlayerError(error: PlaybackException) {
                if (!readySent) {
                    readySent = true
                    onReady()
                }
                if (!loop) onFinished(generation, true)
            }
        }
        player.addListener(listener)
        if (player.playbackState == Player.STATE_READY || player.playbackState == Player.STATE_ENDED) {
            readySent = true
            onReady()
        }
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }
    val resize = when (exoResizeMode(fit)) {
        "FILL" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
        "ZOOM" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
    }
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
