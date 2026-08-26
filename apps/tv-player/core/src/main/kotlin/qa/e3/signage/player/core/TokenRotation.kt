package qa.e3.signage.player.core

fun persistRotatedToken(store: DeviceCredentialStore, rotatedToken: String?): Boolean {
    if (rotatedToken.isNullOrBlank()) return false
    val current = store.read() ?: return false
    if (current.deviceToken == rotatedToken) return false
    store.save(current.copy(deviceToken = rotatedToken))
    return true
}
