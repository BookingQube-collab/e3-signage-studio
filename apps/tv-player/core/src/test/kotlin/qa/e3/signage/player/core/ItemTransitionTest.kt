package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ItemTransitionTest {
    @Test
    fun parsesCanonicalAndUiLabels() {
        assertEquals(ItemTransition.CUT, parseItemTransition("CUT"))
        assertEquals(ItemTransition.FADE, parseItemTransition("FADE"))
        assertEquals(ItemTransition.SLIDE, parseItemTransition("SLIDE"))
        assertEquals(ItemTransition.SLIDE_RIGHT, parseItemTransition("SLIDE_RIGHT"))
        assertEquals(ItemTransition.SLIDE_UP, parseItemTransition("Slide up"))
        assertEquals(ItemTransition.SLIDE_DOWN, parseItemTransition("SLIDE_DOWN"))
        assertEquals(ItemTransition.ZOOM, parseItemTransition("ZOOM"))
        assertEquals(ItemTransition.WIPE, parseItemTransition("WIPE"))
        assertEquals(ItemTransition.DISSOLVE, parseItemTransition("DISSOLVE"))
        assertEquals(ItemTransition.CUT, parseItemTransition("None"))
        assertEquals(ItemTransition.FADE, parseItemTransition(null))
        assertTrue(ItemTransition.CUT.isInstant())
        assertFalse(ItemTransition.SLIDE.isInstant())
    }

    @Test
    fun durationMatchesCmsPreview() {
        assertEquals(800, ITEM_TRANSITION_MS)
    }
}
