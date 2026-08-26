package qa.e3.signage.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Best-effort auto-start after power loss. Many Android TV / Google TV vendors
 * ignore BOOT_COMPLETED or block activity starts from it — set the player as
 * the Home / Leanback launcher when a true kiosk boot is required.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val launch = Intent(context, PlayerActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(launch) }
    }
}
