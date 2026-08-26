package qa.e3.signage.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.unit.dp

@Composable
fun E3BrandStage(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(E3Background),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .align(Alignment.TopStart)
                .padding(start = 40.dp, top = 20.dp)
                .size(280.dp)
                .blur(90.dp)
                .background(E3Pink.copy(alpha = 0.35f), CircleShape),
        )
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 40.dp, bottom = 20.dp)
                .size(300.dp)
                .blur(90.dp)
                .background(E3Blue.copy(alpha = 0.35f), CircleShape),
        )
        Box(
            Modifier
                .align(Alignment.Center)
                .size(220.dp)
                .blur(100.dp)
                .background(E3PurpleDeep.copy(alpha = 0.28f), CircleShape),
        )
        content()
    }
}
