package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Test

class PairingCodeTest {
    @Test
    fun groupsSixDigitsWithASpace() {
        assertEquals("583 294", formatPairingCode("583294"))
        assertEquals("583 294", formatPairingCode("583 294"))
        assertEquals("000 001", formatPairingCode("1"))
    }
}
