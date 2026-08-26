package qa.e3.signage.player.ui

import android.graphics.BitmapFactory
import android.net.Uri
import android.view.ViewGroup
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
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
import qa.e3.signage.player.core.FitMode
import qa.e3.signage.player.core.exoResizeMode
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
            WaitingScreen(state.waitingKind)
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
                    ZoneContent(zone, state.timezone, onVideoFinished)
                }
            }
        }
    }
}

@Composable
private fun ZoneContent(zone: ZoneUiState, timezone: String, onVideoFinished: (Int, Boolean) -> Unit) {
    when (val presentation = zone.presentation) {
        is ZonePresentation.Video -> LocalVideoZone(
            fileUri = presentation.fileUri,
            key = presentation.key,
            generation = presentation.generation,
            loop = presentation.loop,
            fit = zone.fit,
            onFinished = onVideoFinished,
        )
        is ZonePresentation.Image -> LocalImageZone(presentation.fileUri, zone.fit)
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
            PlayerView(ctx).apply {
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
