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
data class SyncStatusResponse(
    val manifestVersion: Int,
    val configVersion: Int,
    val syncRequested: Boolean,
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
)

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
