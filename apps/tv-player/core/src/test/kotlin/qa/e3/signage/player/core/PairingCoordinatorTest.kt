package qa.e3.signage.player.core

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MemoryCredentialStore : DeviceCredentialStore {
    private var value: DeviceCredentials? = null

    override fun read(): DeviceCredentials? = value

    override fun save(credentials: DeviceCredentials) {
        value = credentials
    }

    override fun clear() {
        value = null
    }
}

class FakeDeviceApi : DeviceApi {
    var pairCalls = 0
    var activateCalls = 0
    var failPair: Exception? = null
    val pairCodes = ArrayDeque(listOf("583294", "111222"))
    val activateQueue = ArrayDeque<ActivateResponse>()

    override suspend fun pair(request: PairRequest): PairResponse {
        failPair?.let { throw it }
        pairCalls += 1
        val code = if (pairCodes.isEmpty()) "583294" else pairCodes.removeFirst()
        return PairResponse(code = code, expiresAt = "2099-01-01T00:00:00.000Z", pollAfterMs = 10)
    }

    override suspend fun activate(request: ActivateRequest): ActivateResponse {
        activateCalls += 1
        if (activateQueue.isEmpty()) {
            return ActivateResponse(status = ActivateStatus.PENDING)
        }
        return activateQueue.removeFirst()
    }

    override suspend fun syncStatus(deviceId: String, bearerToken: String): SyncStatusResponse {
        error("not used in pairing tests")
    }

    override suspend fun manifest(deviceId: String, bearerToken: String): ContentManifest {
        error("not used in pairing tests")
    }

    override suspend fun confirmSync(
        deviceId: String,
        bearerToken: String,
        body: SyncConfirmationRequest,
    ): OkResponse {
        error("not used in pairing tests")
    }

    override suspend fun heartbeat(
        deviceId: String,
        bearerToken: String,
        body: DeviceHeartbeatRequest,
    ): OkResponse {
        error("not used in pairing tests")
    }

    override suspend fun playbackLogs(
        deviceId: String,
        bearerToken: String,
        body: PlaybackLogBatch,
    ): BatchAcceptedResponse {
        error("not used in pairing tests")
    }

    override suspend fun errorLogs(
        deviceId: String,
        bearerToken: String,
        body: ErrorLogBatch,
    ): BatchAcceptedResponse {
        error("not used in pairing tests")
    }
}

class PairingCoordinatorTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun skipsPairingWhenTokenAlreadyStored() = runTest {
        val store = MemoryCredentialStore()
        store.save(DeviceCredentials("token-value", "device-1", "screen-1"))
        val api = FakeDeviceApi()
        val events = mutableListOf<PairingEvent>()
        PairingCoordinator(api, store).run("0.9.0", "Living Room") { events.add(it) }
        assertEquals(0, api.pairCalls)
        assertTrue(events.single() is PairingEvent.Paired)
    }

    @Test
    fun pendingThenActivatedPersistsCredentialsOnce() = runTest {
        val store = MemoryCredentialStore()
        val api = FakeDeviceApi()
        api.activateQueue.add(ActivateResponse(status = ActivateStatus.PENDING))
        api.activateQueue.add(
            ActivateResponse(
                status = ActivateStatus.ACTIVATED,
                deviceToken = "issued-token",
                deviceId = "11111111-1111-1111-1111-111111111111",
                screenId = "22222222-2222-2222-2222-222222222222",
            ),
        )
        val events = mutableListOf<PairingEvent>()
        PairingCoordinator(api, store).run("0.9.0", "Lobby TV") { events.add(it) }
        assertEquals(1, api.pairCalls)
        val paired = events.last() as PairingEvent.Paired
        assertEquals("11111111-1111-1111-1111-111111111111", paired.deviceId)
        assertEquals("issued-token", store.read()?.deviceToken)
        assertTrue(events.any { it is PairingEvent.CodeReady && it.grouped == "583 294" })
    }

    @Test
    fun expiredCodeRequestsANewPair() = runTest {
        val store = MemoryCredentialStore()
        val api = FakeDeviceApi()
        api.activateQueue.add(ActivateResponse(status = ActivateStatus.EXPIRED))
        api.activateQueue.add(
            ActivateResponse(
                status = ActivateStatus.ACTIVATED,
                deviceToken = "second-token",
                deviceId = "device-2",
                screenId = "screen-2",
            ),
        )
        PairingCoordinator(api, store).run("0.9.0", "Lobby TV") {}
        assertEquals(2, api.pairCalls)
        assertEquals("second-token", store.read()?.deviceToken)
    }

    @Test
    fun incompleteActivationIsNotStored() = runTest {
        val store = MemoryCredentialStore()
        val api = FakeDeviceApi()
        api.activateQueue.add(ActivateResponse(status = ActivateStatus.ACTIVATED, deviceToken = null))
        api.activateQueue.add(
            ActivateResponse(
                status = ActivateStatus.ACTIVATED,
                deviceToken = "real-token",
                deviceId = "device-3",
                screenId = "screen-3",
            ),
        )
        val events = mutableListOf<PairingEvent>()
        PairingCoordinator(api, store).run("0.9.0", "Lobby TV") { events.add(it) }
        assertTrue(events.any { it is PairingEvent.Failed })
        assertEquals("real-token", store.read()?.deviceToken)
    }

    @Test
    fun parsesActivateJsonWithoutLoggingTokenShape() {
        val parsed =
            json.decodeFromString<ActivateResponse>(
                """{"status":"ACTIVATED","deviceToken":"secret-token","deviceId":"d","screenId":"s"}""",
            )
        assertEquals(ActivateStatus.ACTIVATED, parsed.status)
        assertEquals("secret-token", parsed.deviceToken)
        assertFalse(redactHttp("""{"deviceToken":"secret-token"}""").contains("secret-token"))
    }

    @Test
    fun fetchManifestOnlyOnVersionBump() {
        assertFalse(shouldFetchManifest(4, 4, syncRequested = false))
        assertTrue(shouldFetchManifest(5, 4, syncRequested = false))
        assertTrue(shouldFetchManifest(4, 4, syncRequested = true))
    }
}
