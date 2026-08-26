package qa.e3.signage.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun PairingRoute(
    viewModel: PairingViewModel = viewModel(),
    onPaired: () -> Unit,
) {
    val state by viewModel.ui.collectAsStateWithLifecycle()
    LaunchedEffect(state.paired) {
        if (state.paired) onPaired()
    }
    if (!state.paired) {
        PairingScreen(state)
    }
}

@Composable
fun PairingScreen(state: PairingUiState) {
    E3BrandStage {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
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
            Spacer(Modifier.height(28.dp))
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
}
