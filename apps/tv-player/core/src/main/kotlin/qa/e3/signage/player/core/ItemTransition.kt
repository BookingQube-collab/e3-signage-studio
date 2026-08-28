package qa.e3.signage.player.core

/**
 * Playlist item enter transition. Canonical values match CMS `TRANSITIONS`.
 * Duration must stay in sync with `PREVIEW_FADE_MS`.
 */
enum class ItemTransition {
    CUT,
    FADE,
    DISSOLVE,
    SLIDE,
    SLIDE_RIGHT,
    SLIDE_UP,
    SLIDE_DOWN,
    ZOOM,
    WIPE,
}

const val ITEM_TRANSITION_MS = 800

fun parseItemTransition(raw: String?): ItemTransition {
    val key = raw?.trim()?.uppercase()?.replace(' ', '_') ?: return ItemTransition.FADE
    return when (key) {
        "CUT", "NONE" -> ItemTransition.CUT
        "DISSOLVE" -> ItemTransition.DISSOLVE
        "SLIDE", "SLIDE_LEFT" -> ItemTransition.SLIDE
        "SLIDE_RIGHT" -> ItemTransition.SLIDE_RIGHT
        "SLIDE_UP" -> ItemTransition.SLIDE_UP
        "SLIDE_DOWN" -> ItemTransition.SLIDE_DOWN
        "ZOOM" -> ItemTransition.ZOOM
        "WIPE" -> ItemTransition.WIPE
        else -> ItemTransition.FADE
    }
}

fun ItemTransition.isInstant(): Boolean = this == ItemTransition.CUT
