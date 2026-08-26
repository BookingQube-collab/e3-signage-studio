package qa.e3.signage.player.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface DeviceConfigDao {
    @Query("SELECT * FROM device_config WHERE id = 1")
    suspend fun get(): DeviceConfigEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: DeviceConfigEntity)
}

@Dao
interface SyncStateDao {
    @Query("SELECT * FROM sync_state WHERE id = 1")
    suspend fun get(): SyncStateEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: SyncStateEntity)
}

@Dao
interface ContentPackageDao {
    @Query("SELECT * FROM content_packages WHERE state = :state LIMIT 1")
    suspend fun findByState(state: String): ContentPackageEntity?

    @Query("SELECT * FROM content_packages WHERE manifestVersion = :version LIMIT 1")
    suspend fun findByVersion(version: Int): ContentPackageEntity?

    @Query("SELECT * FROM content_packages")
    suspend fun all(): List<ContentPackageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: ContentPackageEntity)

    @Query("UPDATE content_packages SET state = :newState WHERE state = :oldState AND manifestVersion != :keepVersion")
    suspend fun demoteState(oldState: String, newState: String, keepVersion: Int)
}

@Dao
interface MediaAssetDao {
    @Query("SELECT * FROM media_assets")
    suspend fun all(): List<MediaAssetEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: MediaAssetEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rows: List<MediaAssetEntity>)
}
