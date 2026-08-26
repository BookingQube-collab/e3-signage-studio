package qa.e3.signage.player.core

interface DeviceApi {
    suspend fun pair(request: PairRequest): PairResponse

    suspend fun activate(request: ActivateRequest): ActivateResponse

    suspend fun syncStatus(deviceId: String, bearerToken: String): SyncStatusResponse

    suspend fun manifest(deviceId: String, bearerToken: String): ContentManifest

    suspend fun confirmSync(
        deviceId: String,
        bearerToken: String,
        body: SyncConfirmationRequest,
    ): OkResponse
}

interface DeviceCredentialStore {
    fun read(): DeviceCredentials?

    fun save(credentials: DeviceCredentials)

    fun clear()
}
