package qa.e3.signage.player.core

/** Never log a full device token or Authorization header. */
fun maskSecret(value: String): String {
    if (value.isEmpty()) return "(empty)"
    if (value.length <= 8) return "••••"
    return "${value.take(4)}…${value.takeLast(2)}"
}

fun redactHttp(message: String): String {
    return message
        .replace(Regex("""(?i)(Authorization:\s*Bearer\s+)\S+"""), "$1••••")
        .replace(Regex("""(?i)(X-Device-Token:\s*)\S+"""), "$1••••")
        .replace(Regex("""(?i)("deviceToken"\s*:\s*")[^"]+"""), "$1••••")
        .replace(Regex("""(?i)("rotatedToken"\s*:\s*")[^"]+"""), "$1••••")
}
