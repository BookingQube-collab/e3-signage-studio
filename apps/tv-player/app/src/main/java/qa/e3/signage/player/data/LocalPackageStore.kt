package qa.e3.signage.player.data

import kotlinx.serialization.json.Json
import qa.e3.signage.player.core.ContentManifest
import qa.e3.signage.player.core.ContentPackageState
import qa.e3.signage.player.core.LocalAssetRecord
import qa.e3.signage.player.core.ManifestAsset
import qa.e3.signage.player.core.PackageSnapshot
import qa.e3.signage.player.core.commitActiveSwitch
import qa.e3.signage.player.core.expectedMediaFile
import qa.e3.signage.player.core.planSwitch
import qa.e3.signage.player.core.selectPlaybackPackage
import qa.e3.signage.player.core.writeVersionedManifest
import java.io.File
import androidx.room.withTransaction

class LocalPackageStore(
    private val db: PlayerDatabase,
    private val filesDir: File,
    private val json: Json,
) {
    private val manifestsDir: File get() = File(filesDir, "manifests")

    suspend fun loadActive(): Pair<ContentManifest, File>? {
        val snapshots = db.contentPackageDao().all().map { it.toSnapshot() }
        val row = selectPlaybackPackage(snapshots)?.let { chosen ->
            db.contentPackageDao().findByVersion(chosen.manifestVersion)
        } ?: db.contentPackageDao().findByState(ContentPackageState.ACTIVE.name)
        if (row == null) return null
        val file = row.manifestPath?.takeIf { it.isNotBlank() }?.let { File(it) }
            ?: File(manifestsDir, "active.json")
        if (!file.isFile) return null
        val manifest = json.decodeFromString<ContentManifest>(file.readText())
        return manifest to filesDir
    }

    suspend fun activeVersion(): Int? = loadActive()?.first?.manifestVersion

    suspend fun findByVersion(version: Int): ContentPackageEntity? =
        db.contentPackageDao().findByVersion(version)

    suspend fun persistPackage(version: Int, state: ContentPackageState, manifestPath: String?) {
        persistPackageRow(version, state, manifestPath)
        val local = db.syncStateDao().get() ?: SyncStateEntity()
        db.syncStateDao().upsert(local.copy(packageState = state.name))
    }

    suspend fun persistPackageRow(version: Int, state: ContentPackageState, manifestPath: String?) {
        db.contentPackageDao().upsert(
            ContentPackageEntity(manifestVersion = version, state = state.name, manifestPath = manifestPath),
        )
    }

    suspend fun writePendingManifest(manifest: ContentManifest): File {
        val file = writeManifestFile(manifest)
        persistPackage(manifest.manifestVersion, ContentPackageState.PENDING, file.canonicalPath)
        return file
    }

    /** Write versioned manifest JSON without changing package state (used for same-version refresh). */
    fun writeManifestFile(manifest: ContentManifest): File {
        manifestsDir.mkdirs()
        val text = json.encodeToString(ContentManifest.serializer(), manifest)
        return writeVersionedManifest(manifestsDir, manifest.manifestVersion, text)
    }

    fun readManifestFile(file: File): ContentManifest? =
        runCatching { json.decodeFromString<ContentManifest>(file.readText()) }.getOrNull()

    suspend fun keepAssets(): List<ManifestAsset> {
        val keepStates = setOf(ContentPackageState.ACTIVE.name, ContentPackageState.READY.name)
        val byKey = linkedMapOf<String, ManifestAsset>()
        for (row in db.contentPackageDao().all()) {
            if (row.state !in keepStates) continue
            val file = row.manifestPath?.takeIf { it.isNotBlank() }?.let { File(it) } ?: continue
            val manifest = readManifestFile(file) ?: continue
            for (asset in manifest.assets) {
                byKey["${asset.id}:${asset.version}"] = asset
            }
        }
        return byKey.values.toList()
    }

    suspend fun inventory(): List<LocalAssetRecord> {
        return db.mediaAssetDao().all().map { row ->
            LocalAssetRecord(
                id = row.id,
                version = row.version,
                checksum = row.checksum,
                filePresent = row.localPath.isNotBlank() && File(row.localPath).isFile,
            )
        }
    }

    suspend fun saveAsset(asset: ManifestAsset, localPath: String) {
        db.mediaAssetDao().upsert(
            MediaAssetEntity(
                id = asset.id,
                version = asset.version,
                type = asset.type.name,
                checksum = asset.checksum,
                mimeType = asset.mimeType,
                localPath = localPath,
                fileSize = asset.fileSize,
            ),
        )
    }

    suspend fun saveAssets(manifest: ContentManifest) {
        db.mediaAssetDao().upsertAll(
            manifest.assets.map { asset ->
                MediaAssetEntity(
                    id = asset.id,
                    version = asset.version,
                    type = asset.type.name,
                    checksum = asset.checksum,
                    mimeType = asset.mimeType,
                    localPath = expectedMediaFile(filesDir, asset).canonicalPath,
                    fileSize = asset.fileSize,
                )
            },
        )
    }

    suspend fun switchActive(version: Int, readyPath: String): SwitchOutcome {
        val readyFile = File(readyPath)
        val ready = PackageSnapshot(version, ContentPackageState.READY, readyPath)
        val previous = db.contentPackageDao().findByState(ContentPackageState.ACTIVE.name)?.toSnapshot()
        val plan = planSwitch(previous, ready)
        commitActiveSwitch(manifestsDir, ready, readyFile)
        val prev = plan.previous
        db.withTransaction {
            persistPackageRow(plan.active.manifestVersion, ContentPackageState.ACTIVE, readyFile.canonicalPath)
            if (prev != null) {
                persistPackageRow(prev.manifestVersion, ContentPackageState.READY, prev.manifestPath)
            }
            db.contentPackageDao().demoteState(
                ContentPackageState.ACTIVE.name,
                ContentPackageState.READY.name,
                version,
            )
            val sync = db.syncStateDao().get() ?: SyncStateEntity()
            db.syncStateDao().upsert(
                sync.copy(
                    localManifestVersion = version,
                    packageState = ContentPackageState.ACTIVE.name,
                    lastError = null,
                ),
            )
            val config = db.deviceConfigDao().get()
            if (config != null) {
                db.deviceConfigDao().upsert(config.copy(localManifestVersion = version))
            }
        }
        return SwitchOutcome(activeVersion = version, previousVersion = prev?.manifestVersion)
    }

    suspend fun noteCloudVersion(manifestVersion: Int) {
        val local = db.syncStateDao().get() ?: SyncStateEntity()
        db.syncStateDao().upsert(local.copy(cloudManifestVersion = manifestVersion))
    }

    suspend fun noteError(message: String?) {
        val local = db.syncStateDao().get() ?: SyncStateEntity()
        db.syncStateDao().upsert(local.copy(lastError = message))
    }

    suspend fun lastError(): String? = db.syncStateDao().get()?.lastError

    suspend fun cloudManifestVersion(): Int =
        db.syncStateDao().get()?.cloudManifestVersion ?: 0

    suspend fun currentPackageState(): ContentPackageState? {
        val raw = db.syncStateDao().get()?.packageState ?: return null
        return runCatching { ContentPackageState.valueOf(raw) }.getOrNull()
    }

    private fun ContentPackageEntity.toSnapshot() = PackageSnapshot(
        manifestVersion = manifestVersion,
        state = runCatching { ContentPackageState.valueOf(state) }.getOrDefault(ContentPackageState.PENDING),
        manifestPath = manifestPath,
    )
}

data class SwitchOutcome(
    val activeVersion: Int,
    val previousVersion: Int?,
)
