package qa.e3.signage.player.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        DeviceConfigEntity::class,
        MediaAssetEntity::class,
        PlaylistEntity::class,
        PlaylistItemEntity::class,
        LayoutEntity::class,
        LayoutZoneEntity::class,
        ScheduleEntity::class,
        SyncStateEntity::class,
        ContentPackageEntity::class,
        PendingUploadEntity::class,
        PlaybackLogEntity::class,
        ErrorLogEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class PlayerDatabase : RoomDatabase() {
    abstract fun deviceConfigDao(): DeviceConfigDao
    abstract fun syncStateDao(): SyncStateDao
    abstract fun contentPackageDao(): ContentPackageDao
    abstract fun mediaAssetDao(): MediaAssetDao

    companion object {
        fun create(context: Context): PlayerDatabase {
            return Room.databaseBuilder(context, PlayerDatabase::class.java, "e3-player.db")
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
