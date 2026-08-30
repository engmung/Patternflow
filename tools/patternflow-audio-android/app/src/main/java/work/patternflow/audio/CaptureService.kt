package work.patternflow.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import kotlin.concurrent.thread

/**
 * The capture, as a foreground service: it has to outlive our activity,
 * because the whole point is that Instagram (or whatever is playing) is the
 * app on screen while this runs.
 *
 * Pipeline: AudioPlaybackCapture (other apps' playback, by MediaProjection
 * consent) -> 48 kHz stereo PCM -> mono ring buffer -> 30 Hz analysis ticks
 * (Analyzer) -> lanes over the WebSocket (DeviceLink). Config refreshes from
 * the device every 5 s, so tuning in the console editor lands here without
 * touching the phone.
 */
class CaptureService : Service() {

    companion object {
        const val ACTION_STOP = "work.patternflow.audio.STOP"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        const val EXTRA_HOST = "host"

        // Read by the activity for its meters; written by the service.
        @Volatile var running = false
        @Volatile var status = "idle"
        val uiLevels = FloatArray(4)
    }

    private var projection: MediaProjection? = null
    private var record: AudioRecord? = null
    private var link: DeviceLink? = null
    private val analyzer = Analyzer()
    @Volatile private var alive = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopEverything()
            stopSelf()
            return START_NOT_STICKY
        }
        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        val resultData: Intent? = intent?.getParcelableExtra(EXTRA_RESULT_DATA)
        val host = intent?.getStringExtra(EXTRA_HOST) ?: "patternflow.local"
        if (resultData == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        // Android 14: the service must BE foreground (with the right type)
        // before the projection is created.
        startForeground(
            1, buildNotification(),
            if (Build.VERSION.SDK_INT >= 29)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0
        )

        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = mpm.getMediaProjection(resultCode, resultData)
        // Android 14 refuses capture from a projection with no callback.
        projection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopEverything()
                stopSelf()
            }
        }, null)
        startCapture(host)
        return START_NOT_STICKY
    }

    private fun startCapture(host: String) {
        val proj = projection ?: return
        alive = true
        running = true
        status = "connecting"

        val config = AudioPlaybackCaptureConfiguration.Builder(proj)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()

        val format = AudioFormat.Builder()
            .setSampleRate(Analyzer.SAMPLE_RATE)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
            .build()

        record = AudioRecord.Builder()
            .setAudioPlaybackCaptureConfig(config)
            .setAudioFormat(format)
            .setBufferSizeInBytes(Analyzer.FFT_SIZE * 8)
            .build()

        link = DeviceLink(host).also { it.connect() }

        // Reader: PCM -> mono ring.
        val ring = FloatArray(Analyzer.FFT_SIZE * 4)
        var ringPos = 0
        val ringLock = Object()
        record?.startRecording()

        thread(name = "pf-capture", isDaemon = true) {
            val buf = ShortArray(960 * 2) // 20 ms of stereo
            while (alive) {
                val n = record?.read(buf, 0, buf.size) ?: break
                if (n <= 0) continue
                synchronized(ringLock) {
                    var i = 0
                    while (i + 1 < n) {
                        ring[ringPos] = (buf[i] + buf[i + 1]) / 65536f
                        ringPos = (ringPos + 1) % ring.size
                        i += 2
                    }
                }
            }
        }

        // Analysis: 30 Hz over the newest window, matching the extension.
        thread(name = "pf-analyze", isDaemon = true) {
            val mono = FloatArray(Analyzer.FFT_SIZE)
            var lastConfig = 0L
            var lastFrameSent = 0L
            while (alive) {
                val now = System.currentTimeMillis()
                if (now - lastConfig > 5000) {
                    lastConfig = now
                    link?.fetchConfig()?.let { (bands, smoothing) ->
                        analyzer.bands = bands
                        analyzer.smoothing = smoothing
                    }
                }
                synchronized(ringLock) {
                    var idx = (ringPos - Analyzer.FFT_SIZE + ring.size) % ring.size
                    for (i in 0 until Analyzer.FFT_SIZE) {
                        mono[i] = ring[idx]
                        idx = (idx + 1) % ring.size
                    }
                }
                val lanes = analyzer.analyze(mono)
                System.arraycopy(analyzer.levels, 0, uiLevels, 0, 4)
                val l = link
                if (l != null && now - lastFrameSent > 150) {
                    lastFrameSent = now
                    l.postFrame(buildFrame())
                }
                if (l != null && l.connected) {
                    l.sendLanes(lanes)
                    status = "live"
                } else {
                    status = "device offline - retrying"
                    if (l != null && !l.connected) l.connect()
                    Thread.sleep(1000)
                }
                Thread.sleep(33)
            }
        }
    }

    // "l0..l3;lo0,hi0..lo3,hi3;s0..s63" - the shape parseFrame() on the
    // firmware side insists on, 76 numbers or nothing.
    private fun buildFrame(): String {
        val sb = StringBuilder(620)
        for (i in 0..3) {
            if (i > 0) sb.append(',')
            sb.append(String.format(java.util.Locale.US, "%.3f", analyzer.levels[i]))
        }
        sb.append(';')
        for (i in 0..3) {
            if (i > 0) sb.append(',')
            sb.append(String.format(java.util.Locale.US, "%.3f", analyzer.envLo[i]))
            sb.append(',')
            sb.append(String.format(java.util.Locale.US, "%.3f", analyzer.envHi[i]))
        }
        sb.append(';')
        for (i in 0 until 64) {
            if (i > 0) sb.append(',')
            sb.append(String.format(java.util.Locale.US, "%.2f", analyzer.spectrum[i]))
        }
        return sb.toString()
    }

    private fun stopEverything() {
        alive = false
        running = false
        status = "idle"
        try { record?.stop() } catch (_: Exception) {}
        record?.release(); record = null
        link?.close(); link = null
        projection?.stop(); projection = null
    }

    override fun onDestroy() {
        stopEverything()
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val channelId = "pf-capture"
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(channelId, "Audio capture", NotificationManager.IMPORTANCE_LOW)
        )
        val stopIntent = PendingIntent.getService(
            this, 0,
            Intent(this, CaptureService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Patternflow is listening")
            .setContentText("Sending this phone's audio to the panel")
            .addAction(Notification.Action.Builder(null, "Stop", stopIntent).build())
            .setOngoing(true)
            .build()
    }
}
