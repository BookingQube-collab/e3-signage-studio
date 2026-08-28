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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.clipRect
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
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
        if (!state.playing && state.waitingKind != null) {
            WaitingScreen(state.waitingKind, state.waitingOverrides)
        }
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val density = LocalDensity.current
            state.zones.forEach { zone ->
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

    LaunchedEffect(presentation.layerKey()) {
        if (incoming.layerKey() == presentation.layerKey()) {
            incoming = presentation
            return@LaunchedEffect
        }
        outgoing = incoming
        incoming = presentation
        val effect = presentation.itemTransition()
        if (effect.isInstant() || outgoing == null) {
            progress.snapTo(1f)
            outgoing = null
        } else {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(ITEM_TRANSITION_MS))
            outgoing = null
        }
    }

    Box(Modifier.fillMaxSize().clipToBounds()) {
        val out = outgoing
        val t = progress.value
        val effect = incoming.itemTransition()
        if (out != null) {
            Box(
                Modifier
                    .fillMaxSize()
                    .itemEnterLayer(LayerRole.PREVIOUS, effect, t),
            ) {
                ZoneMedia(out, zone.fit, timezone, onVideoFinished)
            }
        }
        Box(
            Modifier
                .fillMaxSize()
                .itemEnterLayer(LayerRole.CURRENT, effect, t),
        ) {
            ZoneMedia(incoming, zone.fit, timezone, onVideoFinished)
        }
    }
}

private enum class LayerRole { CURRENT, PREVIOUS }

private fun Modifier.itemEnterLayer(role: LayerRole, effect: ItemTransition, progress: Float): Modifier {
    val t = progress.coerceIn(0f, 1f)
    val eased = 1f - (1f - t) * (1f - t) * (1f - t)
    val incoming = role == LayerRole.CURRENT
    val wipe = this.then(
        if (effect == ItemTransition.WIPE && incoming) {
            Modifier.drawWithContent {
                clipRect(left = 0f, top = 0f, right = size.width * t, bottom = size.height) {
                    this@drawWithContent.drawContent()
                }
            }
        } else {
            Modifier
        },
    )
    return wipe.graphicsLayer {
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
    }
}

@Composable
private fun ZoneMedia(
    presentation: ZonePresentation,
    fit: FitMode,
    timezone: String,
    onVideoFinished: (Int, Boolean) -> Unit,
) {
    when (presentation) {
        is ZonePresentation.Video -> LocalVideoZone(
            fileUri = presentation.fileUri,
            key = presentation.key,
            generation = presentation.generation,
            loop = presentation.loop,
            fit = fit,
            onFinished = onVideoFinished,
        )
        is ZonePresentation.Image -> LocalImageZone(presentation.fileUri, fit)
        ZonePresentation.Clock -> ClockZone(timezone, "HH:mm")
        ZonePresentation.Date -> ClockZone(timezone, "dd MMM yyyy")
        ZonePresentation.Empty -> Box(Modifier.fillMaxSize())
    }
}

@Composable
private fun LocalVideoZone(
    fileUri: String,
    key: String,
    generation: Int,
    loop: Boolean,
    fit: FitMode,
    onFinished: (Int, Boolean) -> Unit,
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
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (!loop && playbackState == Player.STATE_ENDED) onFinished(generation, false)
            }

            override fun onPlayerError(error: PlaybackException) {
                if (!loop) onFinished(generation, true)
            }
        }
        player.addListener(listener)
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
        },
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
private fun LocalImageZone(fileUri: String, fit: FitMode) {
    var bitmap by remember(fileUri) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(fileUri) {
        bitmap = withContext(Dispatchers.IO) {
            val file = File(requireLocalPlaybackUri(fileUri))
            if (file.isFile) BitmapFactory.decodeFile(file.path) else null
        }
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
