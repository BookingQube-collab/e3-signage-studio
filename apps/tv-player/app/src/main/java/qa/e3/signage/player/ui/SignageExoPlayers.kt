package qa.e3.signage.player.ui

import android.content.Context
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector

private const val TAG = "E3Exo"

/**
 * Signage SoCs (esp. TCL) often advertise hardware decode for profiles they cannot
 * actually play (WhatsApp HEVC / odd H.264). Prefer the default HW path, then fall
 * back through remaining MediaCodecs including Google/C2 software decoders.
 */
@OptIn(UnstableApi::class)
fun buildSignageExoPlayer(context: Context): ExoPlayer {
    val renderersFactory = DefaultRenderersFactory(context.applicationContext)
        .setEnableDecoderFallback(true)
        .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
        .setMediaCodecSelector(MediaCodecSelector.DEFAULT)
    return ExoPlayer.Builder(context.applicationContext, renderersFactory).build()
}

@OptIn(UnstableApi::class)
fun mediaItemForLocalVideo(uri: android.net.Uri): androidx.media3.common.MediaItem =
    androidx.media3.common.MediaItem.Builder()
        .setUri(uri)
        // Helps extractors pick MP4 for WhatsApp / octet-stream downloads.
        .setMimeType(MimeTypes.VIDEO_MP4)
        .build()

@OptIn(UnstableApi::class)
private fun Player.selectedFormat(trackType: @C.TrackType Int): Format? {
    val tracks = currentTracks
    for (i in 0 until tracks.groups.size) {
        val group = tracks.groups[i]
        if (group.type != trackType || !group.isSelected) continue
        for (j in 0 until group.length) {
            if (group.isTrackSelected(j)) return group.getTrackFormat(j)
        }
    }
    return null
}

@OptIn(UnstableApi::class)
fun Player.logPlaybackFailure(error: PlaybackException, label: String) {
    val video = selectedFormat(C.TRACK_TYPE_VIDEO)
    val audio = selectedFormat(C.TRACK_TYPE_AUDIO)
    Log.e(
        TAG,
        "$label playback failed code=${error.errorCodeName} (${error.errorCode}) " +
            "msg=${error.message} " +
            "videoMime=${video?.sampleMimeType} codecs=${video?.codecs} " +
            "${video?.width}x${video?.height} " +
            "audioMime=${audio?.sampleMimeType} codecs=${audio?.codecs} " +
            "cause=${error.cause?.javaClass?.simpleName}:${error.cause?.message}",
    )
}

/** Logs which decoder ExoPlayer actually initialized (HW vs c2.android / OMX.google). */
@OptIn(UnstableApi::class)
fun decoderInitLogger(): AnalyticsListener =
    object : AnalyticsListener {
        override fun onVideoDecoderInitialized(
            eventTime: AnalyticsListener.EventTime,
            decoderName: String,
            initializedTimestampMs: Long,
            initializationDurationMs: Long,
        ) {
            Log.i(TAG, "video decoder initialized: $decoderName (${initializationDurationMs}ms)")
        }

        override fun onAudioDecoderInitialized(
            eventTime: AnalyticsListener.EventTime,
            decoderName: String,
            initializedTimestampMs: Long,
            initializationDurationMs: Long,
        ) {
            Log.i(TAG, "audio decoder initialized: $decoderName (${initializationDurationMs}ms)")
        }

        override fun onVideoCodecError(
            eventTime: AnalyticsListener.EventTime,
            videoCodecError: Exception,
        ) {
            Log.e(TAG, "video codec error: ${videoCodecError.javaClass.simpleName}: ${videoCodecError.message}")
        }
    }
