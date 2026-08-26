package qa.e3.signage.player

import android.app.Application
import qa.e3.signage.player.data.AppContainer
import qa.e3.signage.player.data.PlayerFiles
import qa.e3.signage.player.data.SyncStatusWorker

class E3PlayerApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        PlayerFiles.ensure(this)
        container = AppContainer(this)
        if (container.store.read() != null) {
            SyncStatusWorker.enqueue(this)
        }
    }
}
