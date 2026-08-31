package qa.e3.signage.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadPlanTest {
    @Test
    fun skipsMatchingChecksumAndVersionFetchesMismatchAndMissing() {
        val assets = listOf(
            asset("keep", 4, "aaa", "keep_v4.mp4", 8_000_000),
            asset("mismatch", 2, "bbb", "mismatch_v2.mp4", 1_000),
            asset("missing", 1, "ccc", "missing_v1.jpg", 50),
        )
        val inventory = listOf(
            LocalAssetRecord("keep", 4, "aaa", filePresent = true),
            LocalAssetRecord("mismatch", 2, "WRONG", filePresent = true),
        )
        val plan = planDownloads(assets, inventory)
        assertEquals(listOf("keep"), plan.toSkip.map { it.id })
        assertEquals(listOf("mismatch", "missing"), plan.toFetch.map { it.id })
        assertEquals(1_050L, plan.neededBytes)
    }

    @Test
    fun absentFileIsFetchedEvenWhenRoomRowMatches() {
        val assets = listOf(asset("gone", 1, "aaa", "gone_v1.mp4", 10))
        val inventory = listOf(LocalAssetRecord("gone", 1, "aaa", filePresent = false))
        val plan = planDownloads(assets, inventory)
        assertTrue(plan.toSkip.isEmpty())
        assertEquals(listOf("gone"), plan.toFetch.map { it.id })
    }

    @Test
    fun changedImageDoesNotRedownloadUnchanged500mbVideo() {
        val assets = listOf(
            asset("video", 1, "aaa", "loop_v1.mp4", 500L * 1024L * 1024L),
            asset("image", 2, "bbb", "hero_v2.jpg", 2L * 1024L * 1024L),
        )
        val inventory = listOf(
            LocalAssetRecord("video", 1, "aaa", filePresent = true),
            LocalAssetRecord("image", 1, "old", filePresent = true),
        )
        val plan = planDownloads(assets, inventory)
        assertEquals(listOf("video"), plan.toSkip.map { it.id })
        assertEquals(listOf("image"), plan.toFetch.map { it.id })
        assertEquals(2L * 1024L * 1024L, plan.neededBytes)
    }

    @Test
    fun progressUsesNeededBytesNotWholeLibrary() {
        assertEquals(0, progressPercent(0, 1_000))
        assertEquals(63, progressPercent(630, 1_000))
        assertEquals(100, progressPercent(0, 0))
        assertEquals(100, progressPercent(1_000, 1_000))
        assertEquals(99, progressPercent(999, 1_000))
    }

    @Test
    fun playlistOrderFetchedBeforeOtherAssets() {
        val assets = listOf(
            asset("layout", 1, "aaa", "bg.jpg", 100),
            asset("v2", 1, "bbb", "second.mp4", 5_000),
            asset("v1", 1, "ccc", "first.mp4", 5_000),
        )
        val playlist = ManifestPlaylist(
            id = "pl",
            version = 1,
            loop = true,
            items = listOf(
                ManifestPlaylistItem("v1", "v1", 10.0, "CUT", "first.mp4"),
                ManifestPlaylistItem("v2", "v2", 10.0, "CUT", "second.mp4"),
            ),
        )
        val plan = planDownloads(assets, inventory = emptyList(), playlist = playlist)
        assertEquals(listOf("v1", "v2", "layout"), plan.toFetch.map { it.id })
    }

    private fun asset(
        id: String,
        version: Int,
        checksum: String,
        filename: String,
        size: Long,
    ) = ManifestAsset(
        id = id,
        version = version,
        type = if (filename.endsWith(".mp4")) MediaKind.VIDEO else MediaKind.IMAGE,
        checksum = checksum,
        fileSize = size,
        localFilename = filename,
        mimeType = "application/octet-stream",
        downloadUrl = "https://signed.example/$filename",
    )
}
