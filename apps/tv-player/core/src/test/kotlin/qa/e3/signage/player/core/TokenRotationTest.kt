package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TokenRotationTest {
    @Test
    fun storesANewTokenAndLeavesUnrelatedFieldsAlone() {
        val store = MemoryCredentialStore()
        store.save(DeviceCredentials("old-token", "device-1", "screen-1"))
        assertTrue(persistRotatedToken(store, "rotated-token-value"))
        val saved = store.read()!!
        assertEquals("rotated-token-value", saved.deviceToken)
        assertEquals("device-1", saved.deviceId)
        assertEquals("screen-1", saved.screenId)
    }

    @Test
    fun ignoresBlankOrIdenticalTokens() {
        val store = MemoryCredentialStore()
        store.save(DeviceCredentials("same", "d", "s"))
        assertFalse(persistRotatedToken(store, null))
        assertFalse(persistRotatedToken(store, "  "))
        assertFalse(persistRotatedToken(store, "same"))
        assertEquals("same", store.read()?.deviceToken)
    }
}
