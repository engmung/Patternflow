package work.patternflow.audio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The analysis half of the Chrome extension's offscreen.js, in Kotlin.
 *
 * Same numbers on purpose: 2048-point FFT, per-bin time smoothing 0.3, band
 * energy as the dB average of the band's bins normalized (db+80)/70, then the
 * per-band chain the whole product shares - damping EMA, auto-range
 * envelopes, the response curve, the output range. A person who tuned a curve
 * against tab audio must find the same curve doing the same thing here.
 *
 * The input window is ALWAYS auto here. Manual windows are values on a
 * specific level scale, and the phone's scale is neither the extension's nor
 * the microphone's - auto normalization is what makes the device's config
 * portable onto this source at all.
 */
class Analyzer {

    companion object {
        const val FFT_SIZE = 2048
        const val SAMPLE_RATE = 48000
        private const val BIN_SMOOTH = 0.3f      // AnalyserNode smoothingTimeConstant
        private const val ENV_RELEASE = 0.004f   // at the 30 Hz tick, ~8 s
        private const val ENV_MIN_SPAN = 0.06f
        private const val AUTO_LO = 0.10f
        private const val AUTO_HI = 0.95f
    }

    // ── config, replaced wholesale by DeviceLink ────────────────────────
    data class Band(
        val hzMin: Float, val hzMax: Float,
        val outMin: Float, val outMax: Float,
        val knob: Int, val muted: Boolean,
        val gain: Float, val curve: Curve?
    )

    @Volatile var bands: List<Band> = emptyList()
    @Volatile var smoothing = 0.35f

    // ── curves, evaluated from the device's meta strings ────────────────
    sealed class Curve {
        data class Bezier(
            val y0: Float, val y1: Float,
            val p1x: Float, val p1y: Float, val p2x: Float, val p2y: Float
        ) : Curve()
        data class Steps(val n: Int) : Curve()
        object Arch : Curve()
    }

    private fun clamp01(v: Float) = min(1f, max(0f, v))

    private fun evalCurve(curve: Curve?, band: Band, uIn: Float): Float {
        val u = clamp01(uIn)
        return when (curve) {
            null -> u.pow(1f / max(0.2f, min(4f, band.gain)))
            is Curve.Steps -> {
                val n = max(2, min(8, curve.n))
                min(n - 1, floor(u * n).toInt()) / (n - 1).toFloat()
            }
            is Curve.Arch -> sin(PI.toFloat() * u)
            is Curve.Bezier -> {
                val bx = { t: Float ->
                    3 * (1 - t) * (1 - t) * t * curve.p1x + 3 * (1 - t) * t * t * curve.p2x + t * t * t
                }
                val by = { t: Float ->
                    (1 - t) * (1 - t) * (1 - t) * curve.y0 +
                        3 * (1 - t) * (1 - t) * t * curve.p1y +
                        3 * (1 - t) * t * t * curve.p2y + t * t * t * curve.y1
                }
                var lo = 0f; var hi = 1f
                repeat(24) {
                    val mid = (lo + hi) / 2
                    if (bx(mid) < u) lo = mid else hi = mid
                }
                clamp01(by((lo + hi) / 2))
            }
        }
    }

    // ── FFT workspace ───────────────────────────────────────────────────
    private val window = FloatArray(FFT_SIZE) { 0.5f * (1f - cos(2f * PI.toFloat() * it / (FFT_SIZE - 1))) }
    private val re = FloatArray(FFT_SIZE)
    private val im = FloatArray(FFT_SIZE)
    private val binDb = FloatArray(FFT_SIZE / 2) { -80f }

    // ── per-band state ──────────────────────────────────────────────────
    private val smoothLevel = FloatArray(4)
    private val envLo = FloatArray(4) { 1f }
    private val envHi = FloatArray(4)

    /** Latest smoothed band levels, for the UI meters. */
    val levels = FloatArray(4)

    /**
     * One tick: window the newest FFT_SIZE mono samples, transform, fold the
     * configured bands, run the shared chain. Returns the four knob lanes -
     * null where no band drives (muted, or no band names that knob).
     */
    fun analyze(mono: FloatArray): Array<Float?> {
        for (i in 0 until FFT_SIZE) {
            re[i] = mono[i] * window[i]
            im[i] = 0f
        }
        fft(re, im)

        // 4/N: full-scale sine -> ~0 dB with the Hann coherent gain folded in.
        val scale = 4f / FFT_SIZE
        for (i in 0 until FFT_SIZE / 2) {
            val mag = sqrt(re[i] * re[i] + im[i] * im[i]) * scale
            val db = 20f * log10(max(mag, 1e-4f))
            binDb[i] = BIN_SMOOTH * binDb[i] + (1f - BIN_SMOOTH) * db
        }

        val cfg = bands
        val lanes = arrayOfNulls<Float>(4)
        if (cfg.isEmpty()) return lanes

        val alpha = max(0.05f, min(0.9f, smoothing))
        for (b in cfg.indices) {
            if (b >= 4) break
            val band = cfg[b]
            val lo = max(0, (band.hzMin * FFT_SIZE / SAMPLE_RATE).toInt())
            val hi = min(FFT_SIZE / 2 - 1, (band.hzMax * FFT_SIZE / SAMPLE_RATE).toInt())
            var sum = 0f
            for (k in lo..max(lo, hi)) sum += binDb[k]
            val energy = clamp01(((sum / (max(lo, hi) - lo + 1)) + 80f) / 70f)

            smoothLevel[b] += (energy - smoothLevel[b]) * alpha
            val level = smoothLevel[b]
            levels[b] = level

            // Envelopes track even muted bands, so unmuting opens on a live
            // window rather than a stale one.
            if (level > envHi[b]) envHi[b] = level
            else envHi[b] += (level - envHi[b]) * ENV_RELEASE
            if (level < envLo[b]) envLo[b] = level
            else envLo[b] += (level - envLo[b]) * ENV_RELEASE
            if (envHi[b] < envLo[b] + ENV_MIN_SPAN) envHi[b] = envLo[b] + ENV_MIN_SPAN

            if (band.muted) continue
            val span = max(0.001f, envHi[b] - envLo[b])
            val u = clamp01((clamp01((level - envLo[b]) / span) - AUTO_LO) / (AUTO_HI - AUTO_LO))
            val v = evalCurve(band.curve, band, u)
            val out = clamp01(band.outMin + v * (band.outMax - band.outMin))

            val k = max(0, min(3, band.knob))
            if (lanes[k] == null) lanes[k] = out
        }
        return lanes
    }

    /** In-place iterative radix-2 FFT. FFT_SIZE is a power of two by decree. */
    private fun fft(re: FloatArray, im: FloatArray) {
        val n = re.size
        var j = 0
        for (i in 0 until n - 1) {
            if (i < j) {
                var t = re[i]; re[i] = re[j]; re[j] = t
                t = im[i]; im[i] = im[j]; im[j] = t
            }
            var m = n shr 1
            while (m in 1..j) { j -= m; m = m shr 1 }
            j += m
        }
        var len = 2
        while (len <= n) {
            val ang = -2.0 * PI / len
            val wr = cos(ang).toFloat()
            val wi = sin(ang).toFloat()
            var i = 0
            while (i < n) {
                var cr = 1f; var ci = 0f
                for (k in 0 until len / 2) {
                    val a = i + k
                    val b = i + k + len / 2
                    val tr = re[b] * cr - im[b] * ci
                    val ti = re[b] * ci + im[b] * cr
                    re[b] = re[a] - tr; im[b] = im[a] - ti
                    re[a] += tr; im[a] += ti
                    val ncr = cr * wr - ci * wi
                    ci = cr * wi + ci * wr
                    cr = ncr
                }
                i += len
            }
            len = len shl 1
        }
    }
}
