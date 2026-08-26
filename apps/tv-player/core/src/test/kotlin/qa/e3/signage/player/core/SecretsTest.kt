package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SecretsTest {
    @Test
    fun maskNeverReturnsTheFullToken() {
        val token = "super-secret-device-token-value"
        val masked = maskSecret(token)
        assertFalse(masked.contains(token))
        assertEquals("supe…ue", masked)
        assertEquals("••••", maskSecret("short"))
    }

    @Test
    fun redactStripsBearerAndJsonTokens() {
        val raw =
            """Authorization: Bearer abcdefghijklmnop
            |"deviceToken":"abcdefghijklmnop"""".trimMargin()
        val redacted = redactHttp(raw)
        assertFalse(redacted.contains("abcdefghijklmnop"))
        assertEquals(true, redacted.contains("••••"))
    }
}
