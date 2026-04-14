package com.example.redex_expensetracker

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class WhitelistSettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_whitelist_settings)

        findViewById<ImageButton>(R.id.btnBack)?.setOnClickListener {
            finish()
        }

        val recyclerView = findViewById<RecyclerView>(R.id.rvApps)
        recyclerView.layoutManager = LinearLayoutManager(this)

        val installedApps = getInstalledPaymentApps()
        val whitelisted = WhitelistManager.getWhitelistedPackages(this).toMutableSet()

        recyclerView.adapter = AppWhitelistAdapter(installedApps, whitelisted) { packageName, isChecked ->
            if (isChecked) whitelisted.add(packageName) else whitelisted.remove(packageName)
            WhitelistManager.saveWhitelistedPackages(this, whitelisted)
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    private fun getInstalledPaymentApps(): List<AppInfo> {
        val knownPaymentApps = mapOf(
            "com.google.android.apps.nbu.paisa.user" to "Google Pay",
            "com.phonepe.app" to "PhonePe",
            "net.one97.paytm" to "Paytm",
            "in.org.npci.upiapp" to "BHIM",
            "com.sbi.upi" to "YONO SBI",
            "com.amazon.mShop.android.shopping" to "Amazon Pay",
            "com.axis.mobile" to "Axis Mobile",
            "com.csam.icici.bank.imobile" to "iMobile Pay (ICICI)",
            "com.snapwork.hdfc" to "HDFC MobileBanking"
        )

        val pm = packageManager
        val result = mutableListOf<AppInfo>()

        for ((pkg, fallbackName) in knownPaymentApps) {
            try {
                val appInfo: ApplicationInfo = pm.getApplicationInfo(pkg, 0)
                val label = pm.getApplicationLabel(appInfo).toString()
                val icon = pm.getApplicationIcon(appInfo)
                result.add(AppInfo(pkg, label, icon))
            } catch (e: PackageManager.NameNotFoundException) {
                // App not installed, skip
            }
        }

        // Sort alphabetically
        return result.sortedBy { it.label }
    }

    data class AppInfo(
        val packageName: String,
        val label: String,
        val icon: android.graphics.drawable.Drawable
    )

    class AppWhitelistAdapter(
        private val apps: List<AppInfo>,
        private val whitelisted: Set<String>,
        private val onToggle: (String, Boolean) -> Unit
    ) : RecyclerView.Adapter<AppWhitelistAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val icon: ImageView = view.findViewById(R.id.ivAppIcon)
            val label: TextView = view.findViewById(R.id.tvAppName)
            val packageName: TextView = view.findViewById(R.id.tvPackageName)
            val checkbox: CheckBox = view.findViewById(R.id.cbWhitelisted)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_app_whitelist, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val app = apps[position]
            holder.icon.setImageDrawable(app.icon)
            holder.label.text = app.label
            holder.packageName.text = app.packageName
            holder.checkbox.isChecked = whitelisted.contains(app.packageName)

            // Prevent checkbox listener firing during bind
            holder.checkbox.setOnCheckedChangeListener(null)
            holder.checkbox.isChecked = whitelisted.contains(app.packageName)
            holder.checkbox.setOnCheckedChangeListener { _, isChecked ->
                onToggle(app.packageName, isChecked)
            }

            holder.itemView.setOnClickListener {
                holder.checkbox.isChecked = !holder.checkbox.isChecked
            }
        }

        override fun getItemCount() = apps.size
    }
}
