package qa.e3.signage.player.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import qa.e3.signage.player.data.ScreenDisplayStore

/**
 * Android TV panels almost always report landscape display metrics even when the
 * glass is mounted vertically. Locking [android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT]
 * letterboxes or ignores rotation on many TCL / OEM builds.
 *
 * Keep the activity in landscape and rotate a full-bleed child instead (Windows-style
 * 4-corner rotate):
 * - [ScreenDisplayStore.LANDSCAPE] → 0°
 * - [ScreenDisplayStore.PORTRAIT_UPSIDE_DOWN] → 90°
 * - [ScreenDisplayStore.LANDSCAPE_UPSIDE_DOWN] → 180°
 * - [ScreenDisplayStore.PORTRAIT] → 270°
 *
 * At 90° / 270° the child lays out at swapped size (panelHeight × panelWidth) so
 * waiting UI and zone playback fill the entire physical panel after rotation.
 * At 180° size stays landscape; only the transform flips.
 */
@Composable
fun DisplayOrientedFrame(
    orientation: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val degrees = ScreenDisplayStore.rotationDegrees(orientation)
    if (degrees == 0f) {
        Box(modifier.fillMaxSize()) { content() }
        return
    }
    val swapAxes = ScreenDisplayStore.swapsAxes(orientation)
    BoxWithConstraints(modifier.fillMaxSize()) {
        val childModifier =
            if (swapAxes) {
                Modifier
                    .align(Alignment.Center)
                    .width(maxHeight)
                    .height(maxWidth)
            } else {
                Modifier.fillMaxSize()
            }
        Box(
            childModifier.graphicsLayer {
                rotationZ = degrees
                transformOrigin = TransformOrigin.Center
            },
        ) {
            content()
        }
    }
}
