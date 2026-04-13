package com.example.redex_expensetracker

import android.os.Bundle
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class SettingsActivity : AppCompatActivity() {

    private val apps = listOf(
        AppItem("Google Pay", "com.google.android.apps.nbu.paisa.user", true),
        AppItem("PhonePe", "com.phonepe.app", true),
        AppItem("Paytm", "net.one97.paytm", true),
        AppItem("BHIM", "in.org.npci.upiapp", true),
        AppItem("SBI Yono", "com.sbi.upi", true),
        AppItem("HDFC Bank", "com.snapwork.hdfc", false),
        AppItem("ICICI iMobile", "com.csam.icici.direct", false),
        AppItem("Axis Mobile", "com.axis.mobile", false)
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val recyclerView: RecyclerView = findViewById(R.id.recyclerView)
        val saveButton: Button = findViewById(R.id.saveButton)

        // Load current whitelist
        val currentWhitelist = WhitelistManager.getWhitelistedPackages(this)
        apps.forEach { app ->
            app.isChecked = currentWhitelist.contains(app.packageName)
        }

        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = WhitelistAdapter(apps)

        saveButton.setOnClickListener {
            val newWhitelist = apps.filter { it.isChecked }.map { it.packageName }.toSet()
            WhitelistManager.saveWhitelistedPackages(this, newWhitelist)
            Toast.makeText(this, "Whitelist Updated!", Toast.LENGTH_SHORT).show()
            finish()
        }
    }
}
