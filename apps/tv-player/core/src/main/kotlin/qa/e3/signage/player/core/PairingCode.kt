package qa.e3.signage.player.core

fun formatPairingCode(code: String): String {
    val digits = code.filter { it.isDigit() }.padStart(6, '0').take(6)
    return "${digits.take(3)} ${digits.drop(3)}"
}

fun digitsOnly(code: String): String = code.filter { it.isDigit() }.take(6)
