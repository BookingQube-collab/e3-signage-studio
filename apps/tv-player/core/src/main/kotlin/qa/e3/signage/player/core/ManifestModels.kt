package qa.e3.signage.player.core

import kotlinx.serialization.Serializable

@Serializable
enum class MediaKind {
    VIDEO,
    IMAGE,
    QR,
    LOGO,
}

@Serializable
enum class ZoneKind {
    VIDEO,
    IMAGE,
    SLIDESHOW,
    TEXT,
    QR,
    LOGO,
    CLOCK,
    DATE,
}

@Serializable
enum class FitMode {
    FIT,
    FILL,
    COVER,
    CONTAIN,
    STRETCH,
}

@Serializable
data class ManifestAsset(
    val id: String,
    val version: Int,
    val type: MediaKind,
    val checksum: String,
    val fileSize: Long,
    val localFilename: String,
    val mimeType: String,
    val downloadUrl: String = "",
)

@Serializable
data class ManifestZone(
    val id: String,
    val type: ZoneKind,
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val fit: FitMode = FitMode.CONTAIN,
    val contentRef: String? = null,
)

@Serializable
data class ManifestLayout(
    val id: String,
    val width: Int,
    val height: Int,
    val background: String,
    val zones: List<ManifestZone> = emptyList(),
)

@Serializable
data class ManifestPlaylistItem(
    val mediaId: String,
    val mediaVersionId: String,
    val durationSeconds: Double,
    val transition: String,
    val localFilename: String,
)

@Serializable
data class ManifestPlaylist(
    val id: String,
    val version: Int,
    val loop: Boolean,
    val items: List<ManifestPlaylistItem> = emptyList(),
)

@Serializable
data class ManifestSchedule(
    val campaignId: String,
    val startAt: String,
    val endAt: String,
    val startTime: String,
    val endTime: String,
    val daysOfWeek: List<Int> = emptyList(),
    val timezone: String,
    val priority: Int,
    val emergency: Boolean = false,
)

@Serializable
data class ContentManifest(
    val screenId: String,
    val manifestVersion: Int,
    val configVersion: Int,
    val generatedAt: String,
    val playlist: ManifestPlaylist? = null,
    val layouts: List<ManifestLayout> = emptyList(),
    val schedules: List<ManifestSchedule> = emptyList(),
    val assets: List<ManifestAsset> = emptyList(),
)
