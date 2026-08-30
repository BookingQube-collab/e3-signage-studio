package qa.e3.signage.player.core

import kotlinx.serialization.Serializable

@Serializable
data class PairRequest(
    val appVersion: String,
    val deviceName: String? = null,
    val orientation: String? = null,
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
data class PairResponse(
    val code: String,
    val expiresAt: String,
    val pollAfterMs: Long,
)

@Serializable
data class ActivateRequest(
    val code: String,
)

@Serializable
enum class ActivateStatus {
    PENDING,
    ACTIVATED,
    EXPIRED,
    INVALID,
}

@Serializable
data class ActivateResponse(
    val status: ActivateStatus,
    val deviceToken: String? = null,
    val deviceId: String? = null,
    val screenId: String? = null,
)

@Serializable
enum class WaitingScreenBrand {
    FULL_LOGO,
    ICON,
    CUSTOM,
}

@Serializable
data class DeviceBrandAsset(
    val mediaId: String,
    val version: Int,
    val checksum: String,
    val fileSize: Long,
    val mimeType: String,
    val downloadUrl: String,
)

@Serializable
data class WaitingScreenConfig(
    val brand: WaitingScreenBrand = WaitingScreenBrand.FULL_LOGO,
    val mediaId: String? = null,
    val version: Int? = null,
    val checksum: String? = null,
    val fileSize: Long? = null,
    val mimeType: String? = null,
    val downloadUrl: String? = null,
    val title: String? = null,
    val message: String? = null,
    val configVersion: Int = 0,
    /**
     * Admin-managed in-app brand icon for waiting/idle UI.
     * Not the Android launcher/home-screen icon — that is baked into the APK.
     */
    val brandIcon: DeviceBrandAsset? = null,
)

@Serializable
data class SyncStatusResponse(
    val manifestVersion: Int,
    val configVersion: Int,
    val syncRequested: Boolean,
    /** CMS screen orientation: LANDSCAPE or PORTRAIT. */
    val orientation: String = "LANDSCAPE",
    val width: Int? = null,
    val height: Int? = null,
    val rotatedToken: String? = null,
    val waitingScreen: WaitingScreenConfig? = null,
)

/**
 * Unauthenticated org branding for the unpaired pairing screen.
 * Fetched from GET /api/devices/player-branding before the device has a token.
 */
@Serializable
data class PublicPlayerBrandingResponse(
    val waitingScreen: WaitingScreenConfig,
    val logo: DeviceBrandAsset? = null,
    val brandingConfigVersion: Int = 0,
    val waitingConfigVersion: Int = 0,
)

@Serializable
data class SyncConfirmationRequest(
    val manifestVersion: Int,
    val packageState: ContentPackageState,
    val failedAssetId: String? = null,
    val error: String? = null,
)

@Serializable
data class OkResponse(
    val ok: Boolean = true,
    val rotatedToken: String? = null,
)

@Serializable
data class BatchAcceptedResponse(
    val accepted: Int,
)

@Serializable
enum class DeviceSyncState {
    WAITING,
    NOTIFIED,
    DOWNLOADING,
    VERIFYING,
    READY,
    ACTIVE,
    FAILED,
    OFFLINE,
}

@Serializable
enum class ScreenOperationalStatus {
    READY,
    SYNCING,
    DOWNLOADING,
    VERIFYING,
    UPDATING,
    ERROR,
    DISABLED,
}

@Serializable
enum class PlaybackResult {
    COMPLETED,
    SKIPPED,
    ERROR,
    INTERRUPTED,
}

@Serializable
data class DeviceHeartbeatRequest(
    val screenId: String,
    val appVersion: String,
    val uptimeSeconds: Int,
    val activeManifestVersion: Int? = null,
    val activePlaylistId: String? = null,
    val currentlyPlayingMediaId: String? = null,
    val totalStorageBytes: Long,
    val availableStorageBytes: Long,
    val networkOnline: Boolean,
    val lastSuccessfulSyncAt: String? = null,
    val lastError: String? = null,
    val operationalStatus: ScreenOperationalStatus,
    val syncState: DeviceSyncState,
    val syncProgress: Int,
)

@Serializable
data class PlaybackLogEvent(
    val clientEventId: String,
    val campaignId: String? = null,
    val playlistId: String? = null,
    val mediaId: String,
    val mediaVersionId: String? = null,
    val startedAt: String,
    val endedAt: String? = null,
    val durationMs: Int,
    val result: PlaybackResult,
)

@Serializable
data class PlaybackLogBatch(
    val batchId: String,
    val screenId: String,
    val events: List<PlaybackLogEvent>,
)

@Serializable
data class ErrorLogEvent(
    val clientEventId: String,
    val at: String,
    val code: String,
    val message: String,
    val mediaId: String? = null,
    val manifestVersion: Int? = null,
)

@Serializable
data class ErrorLogBatch(
    val batchId: String,
    val screenId: String,
    val events: List<ErrorLogEvent>,
)

@Serializable
data class StoredPlaybackEvent(
    val event: PlaybackLogEvent,
    val batchId: String? = null,
    val uploadedAtMs: Long? = null,
)

data class QueuedUpload(
    val id: String,
    val kind: String,
    val payloadJson: String,
    val createdAt: Long,
) {
    companion object {
        const val KIND_HEARTBEAT = "heartbeat"
        const val KIND_PLAYBACK = "playback"
        const val KIND_ERROR = "error"
    }
}

@Serializable
data class DeviceErrorBody(
    val error: String? = null,
)

class DeviceHttpException(
    val httpCode: Int,
    message: String,
) : IllegalStateException(message)

data class DeviceCredentials(
    val deviceToken: String,
    val deviceId: String,
    val screenId: String,
)

@Serializable
enum class ContentPackageState {
    PENDING,
    DOWNLOADING,
    VERIFYING,
    READY,
    ACTIVE,
    FAILED,
}
