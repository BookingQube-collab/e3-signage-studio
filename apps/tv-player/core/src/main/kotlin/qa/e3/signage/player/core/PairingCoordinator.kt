package qa.e3.signage.player.core

import kotlinx.coroutines.delay

sealed class PairingEvent {
    data object RequestingCode : PairingEvent()

    data class CodeReady(
        val code: String,
        val grouped: String,
        val expiresAt: String,
        val pollAfterMs: Long,
    ) : PairingEvent()

    data object WaitingForCms : PairingEvent()

    data class Paired(val deviceId: String, val screenId: String) : PairingEvent()

    data class Failed(val message: String) : PairingEvent()
}

class PairingCoordinator(
    private val api: DeviceApi,
    private val store: DeviceCredentialStore,
    private val delayMillis: suspend (Long) -> Unit = { delay(it) },
) {
    fun alreadyPaired(): DeviceCredentials? {
        val credentials = store.read() ?: return null
        val complete =
            credentials.deviceToken.isNotBlank() &&
                credentials.deviceId.isNotBlank() &&
                credentials.screenId.isNotBlank()
        return credentials.takeIf { complete }
    }

    suspend fun run(
        appVersion: String,
        deviceName: String,
        orientation: String? = null,
        width: Int? = null,
        height: Int? = null,
        emit: suspend (PairingEvent) -> Unit,
    ) {
        alreadyPaired()?.let { credentials ->
            emit(PairingEvent.Paired(credentials.deviceId, credentials.screenId))
            return
        }

        var backoffMs = 2_000L
        while (true) {
            emit(PairingEvent.RequestingCode)
            val pair =
                try {
                    api.pair(
                        PairRequest(
                            appVersion = appVersion,
                            deviceName = deviceName,
                            orientation = orientation,
                            width = width,
                            height = height,
                        ),
                    )
                } catch (error: Exception) {
                    emit(PairingEvent.Failed(error.message ?: "Could not reach the CMS."))
                    delayMillis(backoffMs)
                    backoffMs = (backoffMs * 2).coerceAtMost(30_000L)
                    continue
                }
            backoffMs = 2_000L

            val code = digitsOnly(pair.code)
            if (code.length != 6) {
                emit(PairingEvent.Failed("CMS returned an invalid pairing code."))
                delayMillis(backoffMs)
                continue
            }

            emit(
                PairingEvent.CodeReady(
                    code = code,
                    grouped = formatPairingCode(code),
                    expiresAt = pair.expiresAt,
                    pollAfterMs = pair.pollAfterMs,
                ),
            )

            val pollMs = pair.pollAfterMs.coerceAtLeast(500L)
            var requestNewCode = false
            while (!requestNewCode) {
                delayMillis(pollMs)
                val result =
                    try {
                        api.activate(ActivateRequest(code))
                    } catch (error: Exception) {
                        emit(PairingEvent.Failed(error.message ?: "Could not check pairing status."))
                        continue
                    }
                when (result.status) {
                    ActivateStatus.PENDING -> emit(PairingEvent.WaitingForCms)
                    ActivateStatus.EXPIRED, ActivateStatus.INVALID -> requestNewCode = true
                    ActivateStatus.ACTIVATED -> {
                        val token = result.deviceToken
                        val deviceId = result.deviceId
                        val screenId = result.screenId
                        if (token.isNullOrBlank() || deviceId.isNullOrBlank() || screenId.isNullOrBlank()) {
                            emit(PairingEvent.Failed("CMS returned an incomplete activation."))
                            requestNewCode = true
                        } else {
                            store.save(DeviceCredentials(token, deviceId, screenId))
                            emit(PairingEvent.Paired(deviceId, screenId))
                            return
                        }
                    }
                }
            }
        }
    }
}
