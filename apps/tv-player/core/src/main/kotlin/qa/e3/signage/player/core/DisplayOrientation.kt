package qa.e3.signage.player.core

/**
 * CMS screen mount orientation and the Compose size math needed to software-rotate
 * a landscape Android TV activity so content fills the physical panel.
 *
 * Critical: at 90°/270° the child must lay out at **swapped** size
 * `(parentHeight × parentWidth)` using constraints that **ignore** the parent's
 * max height/width. Plain `Modifier.width(h).height(w)` is clamped by the
 * landscape parent to roughly `min(w,h)²` — a centered postage stamp after rotate.
 */
object DisplayOrientation {
    const val LANDSCAPE = "LANDSCAPE"
    const val PORTRAIT = "PORTRAIT"
    const val LANDSCAPE_UPSIDE_DOWN = "LANDSCAPE_UPSIDE_DOWN"
    const val PORTRAIT_UPSIDE_DOWN = "PORTRAIT_UPSIDE_DOWN"

    fun normalize(raw: String?): String {
        val value = raw?.trim()?.uppercase().orEmpty()
        return when (value) {
            PORTRAIT -> PORTRAIT
            PORTRAIT_UPSIDE_DOWN,
            "PORTRAIT_REVERSE",
            "REVERSE_PORTRAIT",
            "PORTRAIT_INVERTED",
            -> PORTRAIT_UPSIDE_DOWN
            LANDSCAPE_UPSIDE_DOWN,
            "LANDSCAPE_REVERSE",
            "REVERSE_LANDSCAPE",
            "LANDSCAPE_INVERTED",
            -> LANDSCAPE_UPSIDE_DOWN
            else -> LANDSCAPE
        }
    }

    fun isPortrait(orientation: String): Boolean {
        val n = normalize(orientation)
        return n == PORTRAIT || n == PORTRAIT_UPSIDE_DOWN
    }

    /** True when the child must lay out at swapped (height × width) before rotating. */
    fun swapsAxes(orientation: String): Boolean =
        when (normalize(orientation)) {
            PORTRAIT, PORTRAIT_UPSIDE_DOWN -> true
            else -> false
        }

    /** Compose rotationZ degrees (clockwise) for [orientation]. */
    fun rotationDegrees(orientation: String): Float =
        when (normalize(orientation)) {
            PORTRAIT -> 270f
            PORTRAIT_UPSIDE_DOWN -> 90f
            LANDSCAPE_UPSIDE_DOWN -> 180f
            else -> 0f
        }

    /**
     * Pre-rotation child size that maps exactly onto [parentWidthPx]×[parentHeightPx]
     * after [OrientedChildSize.rotationZ].
     */
    fun orientedChildSize(
        parentWidthPx: Int,
        parentHeightPx: Int,
        orientation: String,
    ): OrientedChildSize {
        val w = parentWidthPx.coerceAtLeast(1)
        val h = parentHeightPx.coerceAtLeast(1)
        val degrees = rotationDegrees(orientation)
        return if (swapsAxes(orientation)) {
            OrientedChildSize(widthPx = h, heightPx = w, rotationZ = degrees)
        } else {
            OrientedChildSize(widthPx = w, heightPx = h, rotationZ = degrees)
        }
    }

    /**
     * Logical CMS canvas size for [orientation]: portrait mounts are tall (e.g. 1080×1920),
     * landscape mounts are wide (e.g. 1920×1080). Swaps axes when the stored pair disagrees.
     */
    fun orientedCanvasSize(
        width: Int,
        height: Int,
        orientation: String,
    ): OrientedCanvasSize {
        val w = width.coerceAtLeast(1)
        val h = height.coerceAtLeast(1)
        return if (isPortrait(orientation)) {
            if (w > h) OrientedCanvasSize(heightPx = w, widthPx = h) else OrientedCanvasSize(widthPx = w, heightPx = h)
        } else {
            if (h > w) OrientedCanvasSize(widthPx = h, heightPx = w) else OrientedCanvasSize(widthPx = w, heightPx = h)
        }
    }

    /**
     * Uniform contain/fit scale mapping a published layout canvas onto the oriented
     * frame while preserving aspect ratio (letterbox / pillarbox when needed).
     * Independent scaleX/scaleY exact-fill was the 0.24.0 zoom/crop failure mode.
     *
     * Returns the largest uniform scale that keeps the full canvas visible — never
     * shrinks below the max-contain size into a postage stamp when aspects match.
     */
    fun layoutFitScale(
        layoutWidth: Int,
        layoutHeight: Int,
        frameWidthPx: Int,
        frameHeightPx: Int,
    ): LayoutFillScale {
        val lw = layoutWidth.coerceAtLeast(1).toFloat()
        val lh = layoutHeight.coerceAtLeast(1).toFloat()
        val fw = frameWidthPx.coerceAtLeast(1).toFloat()
        val fh = frameHeightPx.coerceAtLeast(1).toFloat()
        val scale = minOf(fw / lw, fh / lh)
        return LayoutFillScale(scaleX = scale, scaleY = scale)
    }

    /**
     * Target pixel size of a layout canvas after max-contain into the oriented frame.
     * Used so Compose lays out at the final size instead of an oversized requiredSize
     * + graphicsLayer shrink (which underscaled on some TCL panels in 0.25.0).
     */
    fun containedLayoutSize(
        layoutWidth: Int,
        layoutHeight: Int,
        frameWidthPx: Int,
        frameHeightPx: Int,
    ): OrientedCanvasSize {
        val fit = layoutFitScale(layoutWidth, layoutHeight, frameWidthPx, frameHeightPx)
        val w = (layoutWidth.coerceAtLeast(1) * fit.scaleX).toInt().coerceAtLeast(1)
        val h = (layoutHeight.coerceAtLeast(1) * fit.scaleY).toInt().coerceAtLeast(1)
        return OrientedCanvasSize(widthPx = w, heightPx = h)
    }
}

data class OrientedChildSize(
    val widthPx: Int,
    val heightPx: Int,
    val rotationZ: Float,
)

data class OrientedCanvasSize(
    val widthPx: Int,
    val heightPx: Int,
)

data class LayoutFillScale(
    val scaleX: Float,
    val scaleY: Float,
)
