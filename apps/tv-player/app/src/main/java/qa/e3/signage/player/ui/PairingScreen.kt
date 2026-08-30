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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import qa.e3.signage.player.R
import qa.e3.signage.player.core.WaitingScreenBrand
import qa.e3.signage.player.data.WaitingScreenState
import java.io.File

@Composable
fun PairingRoute(
    viewModel: PairingViewModel = viewModel(),
    onPaired: () -> Unit,
) {
    val state by viewModel.ui.collectAsStateWithLifecycle()
    val branding by viewModel.branding.collectAsStateWithLifecycle()
    LaunchedEffect(state.paired) {
        if (state.paired) onPaired()
    }
    if (!state.paired) {
        PairingScreen(state, branding)
    }
}

@Composable
fun PairingScreen(state: PairingUiState, branding: WaitingScreenState = WaitingScreenState()) {
    val useCustom =
        branding.brand == WaitingScreenBrand.CUSTOM && !branding.localImagePath.isNullOrBlank()
    var backgroundBitmap by remember(branding.localImagePath, useCustom) {
        mutableStateOf<android.graphics.Bitmap?>(null)
    }
    LaunchedEffect(branding.localImagePath, useCustom) {
        backgroundBitmap = withContext(Dispatchers.IO) {
            if (!useCustom) return@withContext null
            val path = branding.localImagePath ?: return@withContext null
            val file = File(path)
            if (file.isFile) BitmapFactory.decodeFile(file.path) else null
        }
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (useCustom && backgroundBitmap != null) {
            Image(
                bitmap = backgroundBitmap!!.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f)),
            )
            PairingContent(state, branding, showBrandMark = false)
        } else {
            E3BrandStage {
                PairingContent(state, branding, showBrandMark = true)
            }
        }
    }
}

@Composable
private fun PairingContent(
    state: PairingUiState,
    branding: WaitingScreenState,
    showBrandMark: Boolean,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(horizontal = 72.dp)
            .widthIn(max = 980.dp),
    ) {
        if (showBrandMark) {
            PairingBrandMark(branding)
            Spacer(Modifier.height(28.dp))
        }
        Text(
            text = "DEVICE NOT PAIRED",
            color = E3Muted,
            fontFamily = Rajdhani,
            fontWeight = FontWeight.SemiBold,
            fontSize = 16.sp,
            letterSpacing = 6.sp,
        )
        Spacer(Modifier.height(18.dp))
        Text(
            text = state.groupedCode,
            style = TextStyle(
                brush = E3Gradient,
                fontFamily = Rajdhani,
                fontWeight = FontWeight.Bold,
                fontSize = 64.sp,
                letterSpacing = 18.sp,
            ),
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = state.message,
            color = Color.White,
            fontFamily = SpaceGrotesk,
            fontSize = 18.sp,
            textAlign = TextAlign.Center,
            lineHeight = 26.sp,
        )
        if (state.error != null) {
            Spacer(Modifier.height(10.dp))
            Text(
                text = state.error,
                color = E3Pink,
                fontFamily = SpaceGrotesk,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(36.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(10.dp)
                    .background(if (state.connected) Color(0xFF3DDC97) else Color(0xFF8A858E), CircleShape),
            )
            Text(
                text = if (state.connected) "  Connected" else "  Offline",
                color = Color.White,
                fontFamily = SpaceGrotesk,
                fontSize = 16.sp,
            )
        }
    }
}

@Composable
private fun PairingBrandMark(branding: WaitingScreenState) {
    val preferIcon = branding.brand == WaitingScreenBrand.ICON
    val logoPath =
        when {
            preferIcon && !branding.localBrandIconPath.isNullOrBlank() -> branding.localBrandIconPath
            !branding.localLogoPath.isNullOrBlank() -> branding.localLogoPath
            !branding.localBrandIconPath.isNullOrBlank() -> branding.localBrandIconPath
            else -> null
        }
    var logoBitmap by remember(logoPath) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(logoPath) {
        logoBitmap = withContext(Dispatchers.IO) {
            val path = logoPath ?: return@withContext null
            val file = File(path)
            if (file.isFile) BitmapFactory.decodeFile(file.path) else null
        }
    }

    if (logoBitmap != null) {
        Image(
            bitmap = logoBitmap!!.asImageBitmap(),
            contentDescription = "Brand",
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxWidth()
                .height(if (preferIcon) 140.dp else 120.dp)
                .padding(horizontal = 24.dp),
        )
        return
    }

    val resId =
        if (preferIcon) R.drawable.e3_icon else R.drawable.e3_full_logo
    Image(
        painter = painterResource(resId),
        contentDescription = "Brand",
        contentScale = ContentScale.Fit,
        modifier = Modifier
            .fillMaxWidth()
            .height(if (preferIcon) 140.dp else 120.dp)
            .padding(horizontal = 24.dp),
    )
}
