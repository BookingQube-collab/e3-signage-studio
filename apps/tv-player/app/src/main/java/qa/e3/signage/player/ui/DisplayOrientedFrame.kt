package qa.e3.signage.player.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import qa.e3.signage.player.core.DisplayOrientation

/**
 * Android TV panels almost always report landscape display metrics even when the
 * glass is mounted vertically. Locking [android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT]
 * letterboxes or ignores rotation on many TCL / OEM builds.
 *
 * Keep the activity in landscape and rotate a full-bleed child instead (Windows-style
 * 4-corner rotate):
 * - LANDSCAPE → 0°
 * - PORTRAIT_UPSIDE_DOWN → 90°
 * - LANDSCAPE_UPSIDE_DOWN → 180°
 * - PORTRAIT → 270°
 *
 * Important (0.27): do **not** use oversized [androidx.compose.foundation.layout.requiredWidth] /
 * requiredHeight inside the landscape parent. That reports a taller layout node than the
 * parent (e.g. 1080×1920 in a 1920×1080 slot). TCL / some Compose runtimes clip the
 * overflowing node **before** `graphicsLayer` rotation, so only the top band of the
 * portrait canvas survives — matching the half-black portrait failure on device.
 *
 * Instead: measure the child at the swapped size, but **report the parent’s landscape
 * size** upward, place the child centered with [androidx.compose.ui.layout.Placeable.PlacementScope.placeWithLayer],
 * and rotate in the placement layer so ancestors never see an overflowing layout node.
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
    Layout(
        content = { Box(Modifier.fillMaxSize()) { content() } },
        modifier = modifier.fillMaxSize(),
    ) { measurables, constraints ->
        val parentW = constraints.maxWidth.coerceAtLeast(1)
        val parentH = constraints.maxHeight.coerceAtLeast(1)
        val childConstraints =
            if (swapAxes) {
                Constraints.fixed(width = parentH, height = parentW)
            } else {
                Constraints.fixed(width = parentW, height = parentH)
            }
        val placeable = measurables.first().measure(childConstraints)
        // Report landscape parent size so nothing upstream clips an oversized portrait node.
        layout(parentW, parentH) {
            val x = (parentW - placeable.width) / 2
            val y = (parentH - placeable.height) / 2
            placeable.placeWithLayer(x = x, y = y) {
                rotationZ = degrees
                transformOrigin = TransformOrigin.Center
                clip = false
            }
        }
    }
}
