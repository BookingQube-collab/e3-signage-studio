package qa.e3.signage.player

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import qa.e3.signage.player.data.ScreenDisplayStore
import qa.e3.signage.player.ui.DisplayOrientedFrame
import qa.e3.signage.player.ui.PairingRoute
import qa.e3.signage.player.ui.PlaybackRoute

class PlayerActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        hideSystemBars()
        // Always landscape at the activity level. TCL / many Android TVs letterbox or ignore
        // SCREEN_ORIENTATION_PORTRAIT; CMS portrait is applied via DisplayOrientedFrame.
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        val app = application as E3PlayerApplication
        setContent {
            var paired by remember { mutableStateOf(app.container.store.read() != null) }
            val orientation by app.container.display.orientation.collectAsStateWithLifecycle()
            DisposableEffect(Unit) {
                hideSystemBars()
                onDispose { }
            }
            val displayOrientation =
                if (paired) orientation else ScreenDisplayStore.LANDSCAPE
            DisplayOrientedFrame(orientation = displayOrientation) {
                if (paired) {
                    PlaybackRoute()
                } else {
                    PairingRoute(onPaired = { paired = true })
                }
            }
        }
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
