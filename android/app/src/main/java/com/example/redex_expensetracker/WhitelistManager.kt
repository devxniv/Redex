package com.example.redex_expensetracker

import android.content.Context
import android.content.SharedPreferences

object WhitelistManager {
    private const val PREF_NAME = "redex_whitelist"
    private const val KEY_WHITELIST = "whitelisted_packages"

    private val DEFAULT_WHITELIST = setOf(
        "com.google.android.apps.nbu.paisa.user", // GPay
        "com.phonepe.app",                        // PhonePe
        "net.one97.paytm",                        // Paytm
        "in.org.npci.upiapp",                     // BHIM
        "com.sbi.upi"                             // Yono/SBI
    )

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    fun getWhitelistedPackages(context: Context): Set<String> {
        return getPrefs(context).getStringSet(KEY_WHITELIST, DEFAULT_WHITELIST) ?: DEFAULT_WHITELIST
    }

    fun saveWhitelistedPackages(context: Context, packages: Set<String>) {
        getPrefs(context).edit().putStringSet(KEY_WHITELIST, packages).apply()
    }

    fun isWhitelisted(context: Context, packageName: String): Boolean {
        return getWhitelistedPackages(context).contains(packageName)
    }
}
