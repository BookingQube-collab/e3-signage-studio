package qa.e3.signage.player.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import qa.e3.signage.player.R

val E3Background = Color(0xFF19161A)
val E3Pink = Color(0xFFE95A9D)
val E3Purple = Color(0xFF8D5CDD)
val E3PurpleDeep = Color(0xFF5F0BC0)
val E3Blue = Color(0xFF5BA2ED)
val E3Muted = Color(0xFFB9B4BE)

val E3Gradient = Brush.linearGradient(
    colors = listOf(E3Pink, E3Purple, E3PurpleDeep, E3Blue),
    start = Offset.Zero,
    end = Offset(1100f, 400f),
)

val Rajdhani = FontFamily(
    Font(R.font.rajdhani_semibold, FontWeight.SemiBold),
    Font(R.font.rajdhani_bold, FontWeight.Bold),
)

val SpaceGrotesk = FontFamily(
    Font(R.font.space_grotesk_medium, FontWeight.Medium),
    Font(R.font.space_grotesk_medium, FontWeight.Normal),
)
