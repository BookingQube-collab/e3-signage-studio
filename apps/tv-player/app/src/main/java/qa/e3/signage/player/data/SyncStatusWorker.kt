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

class SyncStatusWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? qa.e3.signage.player.E3PlayerApplication
            ?: return Result.retry()
        if (app.container.store.read() == null) return Result.success()
        return try {
            app.container.sync.syncIfNeeded()
            Result.success()
        } catch (error: Exception) {
            Log.w(TAG, "sync failed: ${error.message}")
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "E3Sync"
        private const val UNIQUE = "e3-sync-status"

        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncStatusWorker>(15, TimeUnit.MINUTES)
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
