package qa.e3.signage.player.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "device_config")
data class DeviceConfigEntity(
    @PrimaryKey val id: Int = 1,
    val deviceId: String? = null,
    val screenId: String? = null,
    val apiBaseUrl: String = "",
    val appVersion: String = "",
    val pairedAt: Long? = null,
    val localManifestVersion: Int = 0,
    val localConfigVersion: Int = 0,
)

@Entity(tableName = "media_assets")
data class MediaAssetEntity(
    @PrimaryKey val id: String,
    val version: Int,
    val type: String,
    val checksum: String,
    val mimeType: String,
    val localPath: String,
    val fileSize: Long,
)

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey val id: String,
    val version: Int,
    val loop: Boolean,
)

@Entity(tableName = "playlist_items")
data class PlaylistItemEntity(
    @PrimaryKey val id: String,
    val playlistId: String,
    val position: Int,
    val mediaId: String,
    val mediaVersionId: String,
    val durationSeconds: Double,
    val transition: String,
    val localFilename: String,
)

@Entity(tableName = "layouts")
data class LayoutEntity(
    @PrimaryKey val id: String,
    val width: Int,
    val height: Int,
    val background: String,
)

@Entity(tableName = "layout_zones")
data class LayoutZoneEntity(
    @PrimaryKey val id: String,
    val layoutId: String,
    val type: String,
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val fit: String,
    val contentRef: String?,
)

@Entity(tableName = "schedules")
data class ScheduleEntity(
    @PrimaryKey val id: String,
    val campaignId: String,
    val startAt: String,
    val endAt: String,
    val startTime: String,
    val endTime: String,
    val daysOfWeek: String,
    val timezone: String,
    val priority: Int,
    val emergency: Boolean,
)

@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val id: Int = 1,
    val cloudManifestVersion: Int = 0,
    val localManifestVersion: Int = 0,
    val packageState: String = "PENDING",
    val lastError: String? = null,
)

@Entity(tableName = "content_packages")
data class ContentPackageEntity(
    @PrimaryKey val manifestVersion: Int,
    val state: String,
    val manifestPath: String?,
)

@Entity(tableName = "pending_uploads")
data class PendingUploadEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val payloadJson: String,
    val createdAt: Long,
)

@Entity(tableName = "playback_logs")
data class PlaybackLogEntity(
    @PrimaryKey val clientEventId: String,
    val payloadJson: String,
    val uploaded: Boolean,
)

@Entity(tableName = "error_logs")
data class ErrorLogEntity(
    @PrimaryKey val clientEventId: String,
    val payloadJson: String,
    val uploaded: Boolean,
)
