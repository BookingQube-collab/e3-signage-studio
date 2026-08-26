package qa.e3.signage.player.data

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class HeartbeatWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? qa.e3.signage.player.E3PlayerApplication
            ?: return Result.retry()
        if (app.container.store.read() == null) return Result.success()
        return try {
            val packages = app.container.packages
            val loaded = packages.loadActive()
            val sync = app.container.db.syncStateDao().get()
            val packageState = sync?.packageState?.let {
                runCatching { qa.e3.signage.player.core.ContentPackageState.valueOf(it) }.getOrNull()
            }
            app.container.telemetry.sendHeartbeat(
                playingMediaId = null,
                playlistId = loaded?.first?.playlist?.id,
                manifestVersion = loaded?.first?.manifestVersion,
                packageState = packageState,
                lastError = sync?.lastError,
            )
            app.container.telemetry.flush()
            Result.success()
        } catch (error: Exception) {
            Log.w(TAG, "heartbeat worker: ${error.message}")
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "E3Heartbeat"
        private const val UNIQUE = "e3-heartbeat"

        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
