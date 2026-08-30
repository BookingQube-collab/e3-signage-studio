package qa.e3.signage.player.core

interface DeviceApi {
    suspend fun pair(request: PairRequest): PairResponse

    suspend fun activate(request: ActivateRequest): ActivateResponse

    /** Org waiting-screen + CMS logo for unpaired pairing UI (no device token). */
    suspend fun playerBranding(): PublicPlayerBrandingResponse

    suspend fun syncStatus(deviceId: String, bearerToken: String): SyncStatusResponse

    suspend fun manifest(deviceId: String, bearerToken: String): ContentManifest

    suspend fun confirmSync(
        deviceId: String,
        bearerToken: String,
        body: SyncConfirmationRequest,
    ): OkResponse

    suspend fun heartbeat(
        deviceId: String,
        bearerToken: String,
        body: DeviceHeartbeatRequest,
    ): OkResponse

    suspend fun playbackLogs(
        deviceId: String,
        bearerToken: String,
        body: PlaybackLogBatch,
    ): BatchAcceptedResponse

    suspend fun errorLogs(
        deviceId: String,
        bearerToken: String,
        body: ErrorLogBatch,
    ): BatchAcceptedResponse
}

interface DeviceCredentialStore {
    fun read(): DeviceCredentials?

    fun save(credentials: DeviceCredentials)

    fun clear()
}
