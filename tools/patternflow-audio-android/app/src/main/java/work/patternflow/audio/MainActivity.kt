package work.patternflow.audio

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView

/**
 * Three controls and four meters. Mapping, curves, damping - all of that
 * lives on the panel's own console page (http://<panel>/audio-in); this
 * screen only starts and stops the pipe.
 */
class MainActivity : Activity() {

    private lateinit var host: EditText
    private lateinit var status: TextView
    private lateinit var startBtn: Button
    private lateinit var stopBtn: Button
    private lateinit var meters: List<ProgressBar>
    private val ui = Handler(Looper.getMainLooper())

    private val prefs by lazy { getSharedPreferences("pf", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        host = findViewById(R.id.host)
        status = findViewById(R.id.status)
        startBtn = findViewById(R.id.start)
        stopBtn = findViewById(R.id.stop)
        meters = listOf(
            findViewById(R.id.meter0), findViewById(R.id.meter1),
            findViewById(R.id.meter2), findViewById(R.id.meter3)
        )

        host.setText(prefs.getString("host", "patternflow.local"))

        startBtn.setOnClickListener {
            prefs.edit().putString("host", host.text.toString().trim()).apply()
            ensurePermissions()
        }
        stopBtn.setOnClickListener {
            startService(
                Intent(this, CaptureService::class.java).setAction(CaptureService.ACTION_STOP)
            )
        }

        // The mapping lives on the panel; this app is the pipe - but the
        // panel's editor opens INSIDE the app, so shaping the sound never
        // means leaving it.
        findViewById<Button>(R.id.openEditor).setOnClickListener {
            val h = host.text.toString().trim().ifEmpty { "patternflow.local" }
            startActivity(
                Intent(this, EditorActivity::class.java).putExtra("host", h)
            )
        }

        ui.post(object : Runnable {
            override fun run() {
                status.text = CaptureService.status
                for (i in 0..3) {
                    meters[i].progress = (CaptureService.uiLevels[i] * 100).toInt()
                }
                startBtn.isEnabled = !CaptureService.running
                stopBtn.isEnabled = CaptureService.running
                ui.postDelayed(this, 150)
            }
        })
    }

    private fun ensurePermissions() {
        val need = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) need.add(Manifest.permission.POST_NOTIFICATIONS)
        if (need.isNotEmpty()) {
            requestPermissions(need.toTypedArray(), 1)
        } else {
            askProjection()
        }
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<String>, results: IntArray) {
        if (code == 1 && results.all { it == PackageManager.PERMISSION_GRANTED }) askProjection()
        else status.text = "audio permission is required"
    }

    private fun askProjection() {
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mpm.createScreenCaptureIntent(), 2)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != 2) return
        if (resultCode != RESULT_OK || data == null) {
            status.text = "capture was declined"
            return
        }
        val svc = Intent(this, CaptureService::class.java)
            .putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode)
            .putExtra(CaptureService.EXTRA_RESULT_DATA, data)
            .putExtra(CaptureService.EXTRA_HOST, host.text.toString().trim())
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc) else startService(svc)
    }
}
