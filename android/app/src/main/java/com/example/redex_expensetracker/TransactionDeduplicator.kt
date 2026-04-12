package com.example.redex_expensetracker

import android.util.Log
import java.util.concurrent.ConcurrentHashMap

object TransactionDeduplicator {

    private const val TAG = "Deduplicator"
    private const val NOTIF_WINDOW_MS = 5_000L     // notification vs notification (5s)
    private const val SCREENSHOT_WINDOW_MS = 30_000L  // notification vs screenshot (30s)

    // Use ConcurrentHashMap for thread safety across different coroutine dispatchers
    private val recentTransactions = ConcurrentHashMap<String, Long>()

    fun isDuplicate(data: TransactionData, source: String): Boolean {
        val now = System.currentTimeMillis()
        val isScreenshot = source.startsWith("share:")
        
        // Use merchant name + amount + type to avoid dropping valid same-amount transactions
        val key = "${data.merchantName.lowercase()}_${data.amount}_${data.type}"

        // Clean up entries older than the longest window
        val iterator = recentTransactions.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (now - entry.value > SCREENSHOT_WINDOW_MS) {
                iterator.remove()
            }
        }

        // Window selection
        val window = if (isScreenshot) SCREENSHOT_WINDOW_MS else NOTIF_WINDOW_MS

        // Check if we've seen this amount/type very recently
        val lastSeen = recentTransactions[key]
        if (lastSeen != null && (now - lastSeen) < window) {
            Log.w(TAG, "DUPLICATE dropped [$source]: ₹${data.amount} ${data.type}")
            return true
        }

        recentTransactions[key] = now
        Log.d(TAG, "UNIQUE [$source]: ₹${data.amount} ${data.type} — forwarding")
        return false
    }
}
