package qa.e3.signage.player.data

import android.util.Log
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import qa.e3.signage.player.core.ActivateRequest
import qa.e3.signage.player.core.ActivateResponse
import qa.e3.signage.player.core.BatchAcceptedResponse
import qa.e3.signage.player.core.ContentManifest
import qa.e3.signage.player.core.DeviceApi
import qa.e3.signage.player.core.DeviceErrorBody
import qa.e3.signage.player.core.DeviceHeartbeatRequest
import qa.e3.signage.player.core.DeviceHttpException
import qa.e3.signage.player.core.ErrorLogBatch
import qa.e3.signage.player.core.OkResponse
import qa.e3.signage.player.core.PairRequest
import qa.e3.signage.player.core.PairResponse
import qa.e3.signage.player.core.PlaybackLogBatch
import qa.e3.signage.player.core.PublicPlayerBrandingResponse
import qa.e3.signage.player.core.SyncConfirmationRequest
import qa.e3.signage.player.core.SyncStatusResponse
import qa.e3.signage.player.core.redactHttp
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import java.util.concurrent.TimeUnit

interface DeviceRetrofitService {
    @POST("api/devices/pair")
    suspend fun pair(@Body body: PairRequest): PairResponse

    @POST("api/devices/activate")
    suspend fun activate(@Body body: ActivateRequest): ActivateResponse

    @GET("api/devices/player-branding")
    suspend fun playerBranding(): PublicPlayerBrandingResponse

    @GET("api/devices/{id}/sync-status")
    suspend fun syncStatus(
        @Path("id") id: String,
        @Header("Authorization") authorization: String,
    ): SyncStatusResponse

    @GET("api/devices/{id}/manifest")
    suspend fun manifest(
        @Path("id") id: String,
        @Header("Authorization") authorization: String,
    ): ContentManifest

    @POST("api/devices/{id}/sync-confirmation")
    suspend fun confirmSync(
        @Path("id") id: String,
        @Header("Authorization") authorization: String,
        @Body body: SyncConfirmationRequest,
    ): OkResponse

    @POST("api/devices/{id}/heartbeat")
    suspend fun heartbeat(
        @Path("id") id: String,
        @Header("Authorization") authorization: String,
        @Body body: DeviceHeartbeatRequest,
    ): OkResponse

    @POST("api/devices/{id}/playback-logs")
    suspend fun playbackLogs(
        @Path("id") id: String,
        @Header("Authorization") authorization: String,
        @Body body: PlaybackLogBatch,
    ): BatchAcceptedResponse

    @POST("api/devices/{id}/error-logs")
    suspend fun errorLogs(
        @Path("id") id: String,
        @Header("Authorization") authorization: String,
        @Body body: ErrorLogBatch,
    ): BatchAcceptedResponse
}

class RetrofitDeviceApi(
    baseUrl: String,
    private val json: Json,
    httpClient: OkHttpClient? = null,
) : DeviceApi {
    private val service: DeviceRetrofitService

    init {
        val client = httpClient ?: defaultClient()
        service = Retrofit.Builder()
            .baseUrl(normalizeBaseUrl(baseUrl))
            .client(client)
            .addConverterFactory(json.asConverterFactory(JSON))
            .build()
            .create(DeviceRetrofitService::class.java)
    }

    override suspend fun pair(request: PairRequest): PairResponse = unwrap { service.pair(request) }

    override suspend fun activate(request: ActivateRequest): ActivateResponse = unwrap { service.activate(request) }

    override suspend fun playerBranding(): PublicPlayerBrandingResponse =
        unwrap { service.playerBranding() }

    override suspend fun syncStatus(deviceId: String, bearerToken: String): SyncStatusResponse =
        unwrap { service.syncStatus(deviceId, "Bearer $bearerToken") }

    override suspend fun manifest(deviceId: String, bearerToken: String): ContentManifest =
        unwrap { service.manifest(deviceId, "Bearer $bearerToken") }

    override suspend fun confirmSync(
        deviceId: String,
        bearerToken: String,
        body: SyncConfirmationRequest,
    ): OkResponse = unwrap { service.confirmSync(deviceId, "Bearer $bearerToken", body) }

    override suspend fun heartbeat(
        deviceId: String,
        bearerToken: String,
        body: DeviceHeartbeatRequest,
    ): OkResponse = unwrap { service.heartbeat(deviceId, "Bearer $bearerToken", body) }

    override suspend fun playbackLogs(
        deviceId: String,
        bearerToken: String,
        body: PlaybackLogBatch,
    ): BatchAcceptedResponse = unwrap { service.playbackLogs(deviceId, "Bearer $bearerToken", body) }

    override suspend fun errorLogs(
        deviceId: String,
        bearerToken: String,
        body: ErrorLogBatch,
    ): BatchAcceptedResponse = unwrap { service.errorLogs(deviceId, "Bearer $bearerToken", body) }

    private suspend fun <T> unwrap(block: suspend () -> T): T {
        return try {
            block()
        } catch (http: HttpException) {
            val raw = http.response()?.errorBody()?.string().orEmpty()
            val message = runCatching { json.decodeFromString<DeviceErrorBody>(raw).error }.getOrNull()
            throw DeviceHttpException(http.code(), message ?: "CMS error ${http.code()}")
        }
    }

    companion object {
        const val TAG = "E3Http"
        val JSON = "application/json; charset=UTF-8".toMediaType()

        fun defaultClient(): OkHttpClient {
            val logging = HttpLoggingInterceptor { message ->
                Log.d(TAG, redactHttp(message))
            }.apply { level = HttpLoggingInterceptor.Level.BASIC }
            return OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()
        }

        fun downloadClient(): OkHttpClient =
            OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .callTimeout(0, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build()

        fun normalizeBaseUrl(raw: String): String {
            val trimmed = raw.trim().trimEnd('/')
            require(trimmed.isNotBlank()) { "Set api.base.url in local.properties" }
            return "$trimmed/"
        }
    }
}
