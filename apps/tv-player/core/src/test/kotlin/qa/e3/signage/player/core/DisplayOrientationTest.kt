package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DisplayOrientationTest {
    @Test
    fun portraitSwapsAxesOntoLandscapePanel() {
        // Physical TCL panel reports landscape metrics even when glass is mounted vertically.
        val child = DisplayOrientation.orientedChildSize(1920, 1080, DisplayOrientation.PORTRAIT)
        assertEquals(1080, child.widthPx)
        assertEquals(1920, child.heightPx)
        assertEquals(270f, child.rotationZ)
        // After 90°/270° rotation, child AABB equals parent — full bleed, not min(w,h)².
        assertEquals(1920, child.heightPx) // maps to parent width
        assertEquals(1080, child.widthPx) // maps to parent height
    }

    @Test
    fun portraitUpsideDownIsOppositeRotation() {
        val child = DisplayOrientation.orientedChildSize(1920, 1080, DisplayOrientation.PORTRAIT_UPSIDE_DOWN)
        assertEquals(1080, child.widthPx)
        assertEquals(1920, child.heightPx)
        assertEquals(90f, child.rotationZ)
    }

    @Test
    fun landscapeUpsideDownKeepsSize() {
        val child = DisplayOrientation.orientedChildSize(1920, 1080, DisplayOrientation.LANDSCAPE_UPSIDE_DOWN)
        assertEquals(1920, child.widthPx)
        assertEquals(1080, child.heightPx)
        assertEquals(180f, child.rotationZ)
        assertFalse(DisplayOrientation.swapsAxes(DisplayOrientation.LANDSCAPE_UPSIDE_DOWN))
    }

    @Test
    fun landscapeIsIdentity() {
        val child = DisplayOrientation.orientedChildSize(3840, 2160, DisplayOrientation.LANDSCAPE)
        assertEquals(3840, child.widthPx)
        assertEquals(2160, child.heightPx)
        assertEquals(0f, child.rotationZ)
    }

    @Test
    fun clampedSquareWouldBeWrongPostageStamp() {
        // Documents the 0.23.0 bug: width(h)+height(w) under parent maxH clamps to min².
        val parentW = 1920
        val parentH = 1080
        val correct = DisplayOrientation.orientedChildSize(parentW, parentH, DisplayOrientation.PORTRAIT)
        val buggyClampedWidth = parentH // ok
        val buggyClampedHeight = parentH // clamped by parent maxHeight — WRONG
        assertEquals(1080, buggyClampedWidth)
        assertEquals(1080, buggyClampedHeight)
        assertTrue(correct.heightPx > buggyClampedHeight)
        assertEquals(parentW, correct.heightPx)
    }

    @Test
    fun portraitLayoutFitsOrientedFrameExactly() {
        val frame = DisplayOrientation.orientedChildSize(1920, 1080, DisplayOrientation.PORTRAIT)
        val scale = DisplayOrientation.layoutFitScale(1080, 1920, frame.widthPx, frame.heightPx)
        assertEquals(1f, scale.scaleX, 0.0001f)
        assertEquals(1f, scale.scaleY, 0.0001f)
    }

    @Test
    fun landscapeLayoutOnPortraitFrameUsesUniformContain() {
        // CMS 1920×1080 into a portrait mount: preserve aspect (letterbox), do not stretch/crop.
        val frame = DisplayOrientation.orientedChildSize(1920, 1080, DisplayOrientation.PORTRAIT)
        val scale = DisplayOrientation.layoutFitScale(1920, 1080, frame.widthPx, frame.heightPx)
        val expected = minOf(1080 / 1920f, 1920 / 1080f)
        assertEquals(expected, scale.scaleX, 0.0001f)
        assertEquals(expected, scale.scaleY, 0.0001f)
        assertEquals(scale.scaleX, scale.scaleY, 0.0001f)
        assertTrue(scale.scaleX < 1f)
    }

    @Test
    fun normalizeAcceptsAliases() {
        assertEquals(DisplayOrientation.PORTRAIT_UPSIDE_DOWN, DisplayOrientation.normalize("portrait_reverse"))
        assertEquals(DisplayOrientation.LANDSCAPE_UPSIDE_DOWN, DisplayOrientation.normalize("LANDSCAPE_INVERTED"))
        assertTrue(DisplayOrientation.isPortrait("PORTRAIT"))
        assertFalse(DisplayOrientation.isPortrait("LANDSCAPE"))
    }
}
