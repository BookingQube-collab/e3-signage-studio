package qa.e3.signage.player.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.requiredHeight
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import qa.e3.signage.player.core.DisplayOrientation
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
 * At 90° / 270° the child **must** lay out at swapped size with [requiredWidth] /
 * [requiredHeight] so parent landscape max constraints cannot clamp it to a centered
 * `min(w,h)²` postage stamp (the 0.23.0 failure mode on device).
 */
@Composable
fun DisplayOrientedFrame(
    orientation: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val degrees = DisplayOrientation.rotationDegrees(orientation)
    if (degrees == 0f) {
        Box(modifier.fillMaxSize()) { content() }
        return
    }
    val swapAxes = DisplayOrientation.swapsAxes(orientation)
    BoxWithConstraints(modifier.fillMaxSize()) {
        // maxWidth/maxHeight are the physical landscape panel in Dp.
        val childModifier =
            if (swapAxes) {
                // required* ignores incoming max constraints — plain width/height does not.
                Modifier
                    .align(Alignment.Center)
                    .requiredWidth(maxHeight)
                    .requiredHeight(maxWidth)
            } else {
                Modifier.fillMaxSize()
            }
        Box(
            childModifier.graphicsLayer {
                rotationZ = degrees
                transformOrigin = TransformOrigin.Center
                clip = false
            },
        ) {
            content()
        }
    }
}
