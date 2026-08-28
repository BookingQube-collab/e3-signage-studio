package qa.e3.signage.player.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
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
    val title: String? = null,
    val message: String? = null,
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
fun WaitingScreen(kind: WaitingKind, overrides: WaitingOverrides = WaitingOverrides()) {
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
                    .background(Color.Black.copy(alpha = 0.45f)),
            )
            WaitingCopyColumn(copy, quip, showTextBrand = false)
        } else {
            E3BrandStage {
                WaitingCopyColumn(copy, quip, showTextBrand = false) {
                    WaitingBrandMark(brand)
                }
            }
        }
    }
}

@Composable
private fun WaitingBrandMark(brand: WaitingScreenBrand) {
    val resId =
        if (brand == WaitingScreenBrand.ICON) R.drawable.e3_icon else R.drawable.e3_full_logo
    val maxHeight = if (brand == WaitingScreenBrand.ICON) 140.dp else 120.dp
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
    brandSlot: (@Composable () -> Unit)? = null,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(horizontal = 72.dp)
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
                    fontSize = 72.sp,
                    letterSpacing = 8.sp,
                ),
            )
            Text(
                text = "DIGITAL SIGNAGE",
                color = Color.White,
                fontFamily = Rajdhani,
                fontWeight = FontWeight.SemiBold,
                fontSize = 22.sp,
                letterSpacing = 10.sp,
            )
        }
        Spacer(Modifier.height(28.dp))
        Text(
            text = copy.kicker,
            color = E3Muted,
            fontFamily = Rajdhani,
            fontWeight = FontWeight.SemiBold,
            fontSize = 18.sp,
            letterSpacing = 5.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = copy.headline,
            style = TextStyle(
                brush = E3Gradient,
                fontFamily = Rajdhani,
                fontWeight = FontWeight.Bold,
                fontSize = 42.sp,
                letterSpacing = 1.sp,
            ),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = copy.body,
            color = Color.White,
            fontFamily = SpaceGrotesk,
            fontSize = 22.sp,
            textAlign = TextAlign.Center,
            lineHeight = 32.sp,
        )
        Spacer(Modifier.height(22.dp))
        Text(
            text = quip,
            color = Color.White.copy(alpha = 0.82f),
            fontFamily = SpaceGrotesk,
            fontSize = 20.sp,
            textAlign = TextAlign.Center,
            lineHeight = 28.sp,
        )
        Spacer(Modifier.height(36.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(10.dp)
                    .background(Color(0xFF3DDC97), CircleShape),
            )
            Text(
                text = "  Paired · waiting for content",
                color = Color.White,
                fontFamily = SpaceGrotesk,
                fontSize = 16.sp,
            )
        }
    }
}
