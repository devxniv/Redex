package com.example.redex_expensetracker

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
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

        requestSmsPermission()
        checkNotificationAccess()
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
            // Send user to the Notification Access settings screen
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
    }
}