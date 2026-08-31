package qa.e3.signage.player.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import qa.e3.signage.player.R
import qa.e3.signage.player.core.WaitingScreenBrand
import java.io.File

enum class WaitingKind {
    FIRST_PUBLISH,
    LOADING_CONTENT,
    DOWNLOAD_FAILED,
    EMPTY_PLAYLIST,
    OFF_HOURS,
}

data class WaitingCopy(
    val kicker: String,
    val headline: String,
    val body: String,
    val quips: List<String>,
)

data class WaitingOverrides(
    val brand: WaitingScreenBrand = WaitingScreenBrand.FULL_LOGO,
    val localImagePath: String? = null,
    /** Synced in-app brand icon; used when brand is ICON. Not the APK launcher icon. */
    val localBrandIconPath: String? = null,
    /** CMS logo for FULL_LOGO mark when present. */
    val localLogoPath: String? = null,
    val title: String? = null,
    val message: String? = null,
)

data class DownloadProgressUi(
    val percent: Int = 0,
    val filesDone: Int = 0,
    val filesTotal: Int = 0,
    val currentFile: String? = null,
    val error: String? = null,
    val failed: Boolean = false,
)

fun waitingCopy(kind: WaitingKind, overrides: WaitingOverrides = WaitingOverrides()): WaitingCopy {
    val builtIn = when (kind) {
        WaitingKind.FIRST_PUBLISH -> WaitingCopy(
            kicker = "PAIRED AND STANDING BY",
            headline = "Waiting for the main act",
            body = "This screen is online. Publish a campaign to this screen and the playlist will take over.",
            quips = listOf(
                "Paired, caffeinated, and waiting for a playlist.",
                "We passed the vibe check. Content is still in makeup.",
                "Standing by like a bouncer with an empty guest list.",
                "We'll play anything you publish. Even the birthday slide.",
            ),
        )
        WaitingKind.LOADING_CONTENT -> WaitingCopy(
            kicker = "DOWNLOADING",
            headline = "Downloading your playlist",
            body = "Large videos can take several minutes on slow Wi‑Fi. Playback starts as soon as the first file is ready.",
            quips = listOf(
                "Fetching clips. First ready file starts the loop.",
                "Slow Wi‑Fi? Hang tight — progress is below.",
                "Downloading in playlist order so showtime is sooner.",
                "Still at 0%? We keep this screen up and keep retrying.",
                "Content is on the way from the studio.",
            ),
        )
        WaitingKind.DOWNLOAD_FAILED -> WaitingCopy(
            kicker = "DOWNLOAD ISSUE",
            headline = "Could not finish download",
            body = "Check Wi‑Fi, then use Sync Now in the CMS. The player will also retry automatically.",
            quips = listOf(
                "Network hiccup. Sync Now kicks another try.",
                "No blank forever — retry is on the way.",
            ),
        )
        WaitingKind.EMPTY_PLAYLIST -> WaitingCopy(
            kicker = "PLAYLIST ARRIVED EMPTY",
            headline = "Nothing to loop yet",
            body = "This screen is paired, but the published playlist has no playable files.",
            quips = listOf(
                "The playlist showed up. It forgot the files.",
                "We have a loop of nothing. Very zen. Not very useful.",
                "Add a clip and this TV will finally have a job.",
            ),
        )
        WaitingKind.OFF_HOURS -> WaitingCopy(
            kicker = "OUTSIDE THE SCHEDULE",
            headline = "Nothing booked this hour",
            body = "The campaign is published, but the current time window is closed.",
            quips = listOf(
                "Even pixels clock out. We'll be here when the schedule opens.",
                "Off-hours hold screen. The playlist is on a tea break.",
                "Quiet hour. Content resumes when the campaign window starts.",
            ),
        )
    }
    // Admin title/message only override the default idle (first publish) screen.
    if (kind != WaitingKind.FIRST_PUBLISH) return builtIn
    return builtIn.copy(
        headline = overrides.title?.takeIf { it.isNotBlank() } ?: builtIn.headline,
        body = overrides.message?.takeIf { it.isNotBlank() } ?: builtIn.body,
    )
}

@Composable
fun WaitingScreen(
    kind: WaitingKind,
    overrides: WaitingOverrides = WaitingOverrides(),
    downloadProgress: DownloadProgressUi? = null,
) {
    val copy = waitingCopy(kind, overrides)
    var quipIndex by remember(kind) { mutableIntStateOf(0) }
    LaunchedEffect(kind) {
        while (true) {
            delay(8_000)
            quipIndex = (quipIndex + 1) % copy.quips.size
        }
    }
    val quip = copy.quips[quipIndex % copy.quips.size]
    val useCustom =
        overrides.brand == WaitingScreenBrand.CUSTOM && !overrides.localImagePath.isNullOrBlank()
    val imagePath = if (useCustom) overrides.localImagePath else null
    var bitmap by remember(imagePath) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(imagePath) {
        bitmap = withContext(Dispatchers.IO) {
            val path = imagePath ?: return@withContext null
            val file = File(path)
            if (file.isFile) BitmapFactory.decodeFile(file.path) else null
        }
    }

    val brand =
        when {
            useCustom && bitmap != null -> WaitingScreenBrand.CUSTOM
            overrides.brand == WaitingScreenBrand.ICON -> WaitingScreenBrand.ICON
            else -> WaitingScreenBrand.FULL_LOGO
        }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (brand == WaitingScreenBrand.CUSTOM && bitmap != null) {
            Image(
                bitmap = bitmap!!.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.55f)),
            )
            WaitingCopyColumn(copy, quip, showTextBrand = false, downloadProgress = downloadProgress)
        } else {
            E3BrandStage {
                WaitingCopyColumn(copy, quip, showTextBrand = false, downloadProgress = downloadProgress) {
                    WaitingBrandMark(brand, overrides.localBrandIconPath, overrides.localLogoPath)
                }
            }
        }
    }
}

@Composable
private fun WaitingBrandMark(brand: WaitingScreenBrand, localBrandIconPath: String?, localLogoPath: String? = null) {
    val preferIcon = brand == WaitingScreenBrand.ICON
    val imagePath =
        when {
            preferIcon && !localBrandIconPath.isNullOrBlank() -> localBrandIconPath
            !localLogoPath.isNullOrBlank() -> localLogoPath
            !localBrandIconPath.isNullOrBlank() -> localBrandIconPath
            else -> null
        }
    var iconBitmap by remember(imagePath) {
        mutableStateOf<android.graphics.Bitmap?>(null)
    }
    LaunchedEffect(imagePath) {
        iconBitmap = withContext(Dispatchers.IO) {
            val path = imagePath ?: return@withContext null
            val file = File(path)
            if (file.isFile) BitmapFactory.decodeFile(file.path) else null
        }
    }

    val maxHeight = if (preferIcon) 140.dp else 120.dp
    if (iconBitmap != null) {
        Image(
            bitmap = iconBitmap!!.asImageBitmap(),
            contentDescription = "Brand",
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxWidth()
                .height(maxHeight)
                .padding(horizontal = 24.dp),
        )
        return
    }

    val resId =
        if (preferIcon) R.drawable.e3_icon else R.drawable.e3_full_logo
    Image(
        painter = painterResource(resId),
        contentDescription = "E3",
        contentScale = ContentScale.Fit,
        modifier = Modifier
            .fillMaxWidth()
            .height(maxHeight)
            .padding(horizontal = 24.dp),
    )
}

@Composable
private fun WaitingCopyColumn(
    copy: WaitingCopy,
    quip: String,
    showTextBrand: Boolean,
    downloadProgress: DownloadProgressUi? = null,
    brandSlot: (@Composable () -> Unit)? = null,
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val narrow = maxWidth < 720.dp
        val horizontalPad = if (narrow) 36.dp else 72.dp
        val headlineSize = if (narrow) 32.sp else 42.sp
        val bodySize = if (narrow) 18.sp else 22.sp
        val bodyLine = if (narrow) 26.sp else 32.sp
        val quipSize = if (narrow) 16.sp else 20.sp
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = horizontalPad)
                .widthIn(max = 980.dp)
                .semantics {
                    contentDescription = "${copy.headline}. ${copy.body}"
                },
        ) {
            if (brandSlot != null) {
                brandSlot()
            } else if (showTextBrand) {
                Text(
                    text = "E3",
                    style = TextStyle(
                        brush = E3Gradient,
                        fontFamily = Rajdhani,
                        fontWeight = FontWeight.Bold,
                        fontSize = if (narrow) 56.sp else 72.sp,
                        letterSpacing = 8.sp,
                    ),
                )
                Text(
                    text = "DIGITAL SIGNAGE",
                    color = Color.White,
                    fontFamily = Rajdhani,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = if (narrow) 18.sp else 22.sp,
                    letterSpacing = 10.sp,
                )
            }
            Spacer(Modifier.height(28.dp))
            Text(
                text = copy.kicker,
                color = Color.White.copy(alpha = 0.75f),
                fontFamily = Rajdhani,
                fontWeight = FontWeight.SemiBold,
                fontSize = if (narrow) 15.sp else 18.sp,
                letterSpacing = 5.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = copy.headline,
                color = Color.White,
                fontFamily = Rajdhani,
                fontWeight = FontWeight.Bold,
                fontSize = headlineSize,
                letterSpacing = 0.5.sp,
                textAlign = TextAlign.Center,
                softWrap = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = copy.body,
                color = Color.White,
                fontFamily = SpaceGrotesk,
                fontSize = bodySize,
                textAlign = TextAlign.Center,
                lineHeight = bodyLine,
                softWrap = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (downloadProgress != null) {
                Spacer(Modifier.height(28.dp))
                DownloadProgressBlock(downloadProgress, narrow)
            }
            Spacer(Modifier.height(22.dp))
            Text(
                text = downloadProgress?.error?.takeIf { downloadProgress.failed }
                    ?: quip,
                color = Color.White.copy(alpha = 0.82f),
                fontFamily = SpaceGrotesk,
                fontSize = quipSize,
                textAlign = TextAlign.Center,
                lineHeight = 28.sp,
                softWrap = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(36.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(10.dp)
                        .background(
                            if (downloadProgress?.failed == true) Color(0xFFFF6B6B) else Color(0xFF3DDC97),
                            CircleShape,
                        ),
                )
                Text(
                    text = when {
                        downloadProgress?.failed == true -> "  Online · download needs retry"
                        downloadProgress != null -> "  Online · downloading content"
                        else -> "  Paired · waiting for content"
                    },
                    color = Color.White,
                    fontFamily = SpaceGrotesk,
                    fontSize = if (narrow) 14.sp else 16.sp,
                )
            }
        }
    }
}

@Composable
private fun DownloadProgressBlock(progress: DownloadProgressUi, narrow: Boolean) {
    val pct = progress.percent.coerceIn(0, 100)
    val fileLine = when {
        progress.filesTotal > 0 ->
            "File ${progress.filesDone.coerceAtMost(progress.filesTotal)} of ${progress.filesTotal}" +
                (progress.currentFile?.let { " · $it" } ?: "")
        else -> progress.currentFile.orEmpty()
    }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 640.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black.copy(alpha = 0.45f))
            .padding(horizontal = 20.dp, vertical = 18.dp),
    ) {
        Text(
            text = if (progress.failed) "Download paused" else "Downloading… $pct%",
            color = Color.White,
            fontFamily = Rajdhani,
            fontWeight = FontWeight.Bold,
            fontSize = if (narrow) 26.sp else 32.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        LinearProgressIndicator(
            progress = { pct / 100f },
            modifier = Modifier
                .fillMaxWidth()
                .height(10.dp)
                .clip(RoundedCornerShape(5.dp)),
            color = if (progress.failed) Color(0xFFFF6B6B) else Color(0xFF3DDC97),
            trackColor = Color.White.copy(alpha = 0.2f),
        )
        if (fileLine.isNotBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(
                text = fileLine,
                color = Color.White.copy(alpha = 0.9f),
                fontFamily = SpaceGrotesk,
                fontSize = if (narrow) 15.sp else 18.sp,
                textAlign = TextAlign.Center,
                softWrap = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Slow Wi‑Fi may take several minutes for large MP4s.",
            color = Color.White.copy(alpha = 0.7f),
            fontFamily = SpaceGrotesk,
            fontSize = if (narrow) 13.sp else 15.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
