package com.example.redex_expensetracker

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<Button>(R.id.btnTest).setOnClickListener {
            lifecycleScope.launch {
                HttpSender.postTransaction(
                    context = this@MainActivity,
                    amount = 0.0,
                    date = "2024-01-01",
                    description = "Hello from Android!",
                    merchantName = "Test Connection",
                    category = "other-expense",
                    source = "test_manual",
                    type = "expense"
                )
            }
        }

        findViewById<Button>(R.id.btnWhitelistSettings).setOnClickListener {
            startActivity(Intent(this, WhitelistSettingsActivity::class.java))
        }

        findViewById<TextView>(R.id.tvStatus).setOnClickListener {
            rebindNotificationListener()
        }

        requestSmsPermission()
        checkNotificationAccess()
    }

    private fun rebindNotificationListener() {
        val pm = packageManager
        pm.setComponentEnabledSetting(
            ComponentName(this, RedexNotificationListener::class.java),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        )
        pm.setComponentEnabledSetting(
            ComponentName(this, RedexNotificationListener::class.java),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        )
        android.widget.Toast.makeText(this, "Notification Listener Re-bound", android.widget.Toast.LENGTH_SHORT).show()
    }



    override fun onResume() {
        super.onResume()
    }

    private fun requestSmsPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS),
                101
            )
        }
    }

    private fun checkNotificationAccess() {
        val enabledListeners = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners"
        )
        val hasAccess = enabledListeners?.contains(packageName) == true

        if (!hasAccess) {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
    }
}
