package work.patternflow.audio

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Everything between this phone and the panel.
 *
 * Config comes FROM the device (GET /api/audio-in) - the same bands, curves
 * and damping the console editor saves, decoded from the same meta strings.
 * The app deliberately has no mapping UI of its own: tune on
 * http://<panel>/audio-in, and this side follows within a few seconds.
 *
 * Levels go TO the device over the audio WebSocket (:81), as absolute lanes -
 * `a=v,v,v,v`, `-` for a lane nothing drives - exactly the extension's
 * protocol (docs/audio-ws-spec.md).
 */
class DeviceLink(private val host: String) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .build()

    @Volatile var connected = false
        private set
    @Volatile var lastError = ""
        private set

    private var ws: WebSocket? = null
    private var lastBody = ""

    // ── config ──────────────────────────────────────────────────────────

    private fun decodeMeta(meta: String): Analyzer.Curve? {
        if (meta.isEmpty()) return null
        if (meta == "a") return Analyzer.Curve.Arch
        if (meta.startsWith("s:")) {
            return Analyzer.Curve.Steps(meta.substring(2).toIntOrNull() ?: 2)
        }
        if (meta.startsWith("p:")) {
            return when (meta.substring(2)) {
                "smooth" -> Analyzer.Curve.Bezier(0f, 1f, 0.45f, 0.05f, 0.55f, 0.95f)
                "sharp" -> Analyzer.Curve.Bezier(0f, 1f, 0.10f, 0.65f, 0.35f, 1.00f)
                "fall" -> Analyzer.Curve.Bezier(1f, 0f, 0.45f, 0.95f, 0.55f, 0.05f)
                else -> null
            }
        }
        if (meta.startsWith("b:")) {
            val q = meta.substring(2).split(',').mapNotNull { it.toIntOrNull() }
            if (q.size != 6) return null
            val f = q.map { it / 100f }
            return Analyzer.Curve.Bezier(f[0], f[1], f[2], f[3], f[4], f[5])
        }
        return null
    }

    data class Config(
        val bands: List<Analyzer.Band>,
        val smoothing: Float,
        val autoRange: Boolean
    )

    // The console page stores level windows through one codec (its linear
    // scale for the microphone's sake); decoding through the SAME constants
    // puts a window back at exactly the axis position it was dragged to.
    // The constants mirror DB_FLOOR/DB_SPAN in the page's adapter - frozen
    // together or windows drift.
    private fun windowDecode(x: Double): Float {
        val db = 20.0 * Math.log10(maxOf(x, 1e-4))
        return ((db + 45.0) / 47.0).toFloat().coerceIn(0f, 1f)
    }

    /** Blocking; call off the main thread. Returns null on any failure. */
    fun fetchConfig(): Config? {
        return try {
            val res: Response = http.newCall(
                Request.Builder().url("http://$host/api/audio-in").build()
            ).execute()
            val body = res.body?.string() ?: return null
            if (!res.isSuccessful) return null
            val j = JSONObject(body)
            val smoothing = j.optDouble("smoothing", 0.35).toFloat()
            val autoRange = j.optBoolean("autoRange", true)
            val arr = j.getJSONArray("bands")
            val bands = ArrayList<Analyzer.Band>(4)
            for (i in 0 until minOf(4, arr.length())) {
                val b = arr.getJSONObject(i)
                bands.add(
                    Analyzer.Band(
                        hzMin = b.optDouble("hzMin", 60.0).toFloat(),
                        hzMax = b.optDouble("hzMax", 250.0).toFloat(),
                        outMin = b.optDouble("outMin", 0.30).toFloat(),
                        outMax = b.optDouble("outMax", 0.85).toFloat(),
                        knob = b.optInt("knob", i),
                        muted = b.optBoolean("muted", false),
                        gain = b.optDouble("gain", 1.0).toFloat(),
                        curve = decodeMeta(b.optString("meta", "")),
                        inMin = windowDecode(b.optDouble("inMin", 0.0)),
                        inMax = windowDecode(b.optDouble("inMax", 1.0))
                    )
                )
            }
            lastError = ""
            Config(bands, smoothing, autoRange)
        } catch (e: Exception) {
            lastError = e.message ?: "config fetch failed"
            null
        }
    }

    // ── the lane socket ─────────────────────────────────────────────────

    fun connect() {
        val target = if (host.contains(':')) host else "$host:81"
        val req = Request.Builder().url("ws://$target").build()
        ws = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true
                lastError = ""
                lastBody = ""
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                connected = false
                lastError = t.message ?: "socket failed"
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                connected = false
            }
        })
    }

    /** All four lanes, one message, only when something changed. */
    fun sendLanes(lanes: Array<Float?>) {
        val body = lanes.joinToString(",") { v ->
            if (v == null) "-"
            else String.format(java.util.Locale.US, "%.3f", v.coerceIn(0f, 1f))
        }
        if (body == lastBody) return
        if (ws?.send("a=$body") == true) lastBody = body
    }

    /** Hand the knobs back to the encoders. */
    fun release() {
        ws?.send("off")
    }

    // ── monitor frames ──────────────────────────────────────────────────
    // The console editor on a mic-less board is blind without these: the
    // phone's levels, envelopes and spectrum, POSTed a few times a second so
    // the page shows what THIS source hears. Fire-and-forget, one in flight -
    // a slow device drops monitor frames, never the lane stream.
    @Volatile private var frameInFlight = false

    fun postFrame(payload: String) {
        if (frameInFlight) return
        frameInFlight = true
        val body = okhttp3.FormBody.Builder().add("frame", payload).build()
        http.newCall(
            Request.Builder().url("http://$host/api/audio-in").post(body).build()
        ).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                frameInFlight = false
            }

            override fun onResponse(call: okhttp3.Call, response: Response) {
                response.close()
                frameInFlight = false
            }
        })
    }

    fun close() {
        try {
            ws?.send("off")
            ws?.close(1000, null)
        } catch (_: Exception) {
        }
        ws = null
        connected = false
    }
}
