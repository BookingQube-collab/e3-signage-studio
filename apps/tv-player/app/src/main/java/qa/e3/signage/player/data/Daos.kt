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

@Dao
interface PendingUploadDao {
    @Query("SELECT * FROM pending_uploads ORDER BY createdAt ASC")
    suspend fun all(): List<PendingUploadEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: PendingUploadEntity)

    @Query("DELETE FROM pending_uploads WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM pending_uploads WHERE kind = :kind")
    suspend fun deleteKind(kind: String)
}

@Dao
interface PlaybackLogDao {
    @Query("SELECT * FROM playback_logs WHERE uploaded = 0")
    suspend fun pending(): List<PlaybackLogEntity>

    @Query("SELECT * FROM playback_logs WHERE uploaded = 1")
    suspend fun uploaded(): List<PlaybackLogEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: PlaybackLogEntity)

    @Query("DELETE FROM playback_logs WHERE clientEventId = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM playback_logs WHERE uploaded = 1")
    suspend fun deleteUploaded()
}

@Dao
interface ErrorLogDao {
    @Query("SELECT * FROM error_logs WHERE uploaded = 0")
    suspend fun pending(): List<ErrorLogEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: ErrorLogEntity)

    @Query("DELETE FROM error_logs WHERE clientEventId = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM error_logs WHERE uploaded = 1")
    suspend fun deleteUploaded()
}
