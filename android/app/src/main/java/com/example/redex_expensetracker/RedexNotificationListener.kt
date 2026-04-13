package com.example.redex_expensetracker

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class RedexNotificationListener : NotificationListenerService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    companion object {
        private const val TAG = "Redex"

        private val PAYMENT_PACKAGES = listOf(
                "com.google.android.apps.nbu.paisa.user", // GPay
                "com.phonepe.app",                        // PhonePe
                "net.one97.paytm",                        // Paytm
                "in.org.npci.upiapp",                     // BHIM
                "com.sbi.upi"                             // Yono/SBI
        )

        private val IGNORE_PHRASES = listOf(
                "tap to view",
                "checking for new messages",
                "running",
                "new notification"
        )

        // De-bounce logic to avoid duplicate triggers
        private var lastNotificationBody = ""
        private var lastNotificationTime = 0L
        private const val DEBOUNCE_DELAY = 3000L // 3 seconds
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val packageName = sbn?.packageName ?: return
        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        val bigText = extras.getCharSequence("android.bigText")?.toString().orEmpty()
        val subText = extras.getCharSequence("android.subText")?.toString().orEmpty()
        val tickerText = notification.tickerText?.toString().orEmpty()

        // Combine all possible text sources to find the real content
        val bodyCandidates = listOf(bigText, text, subText, tickerText)
        val body = bodyCandidates.maxByOrNull { it.length }?.trim().orEmpty()

        // Combine title and body for a complete context
        val fullContent = "Title: $title | Content: $body"

        // 1. Basic Logging
        Log.d(TAG, "Incoming: [$packageName] | $fullContent")

        // 2. Filter for Whitelisted Payment Apps
        if (WhitelistManager.isWhitelisted(this, packageName)) {

            // 3. Filter: Must contain financial indicators (Currency or Keywords)
            val hasCurrency = fullContent.contains("₹") || fullContent.contains("Rs", ignoreCase = true)
            val hasKeywords = listOf("paid", "sent", "received", "spent", "debited", "credited", "payment")
                    .any { fullContent.contains(it, ignoreCase = true) }

            // If it has NO financial indicators, skip it.
            if (!hasCurrency && !hasKeywords) {
                Log.d(TAG, "Skipping non-transactional: $fullContent")
                return
            }

            // 4. De-bounce: Ignore if the same notification arrived recently
            val currentTime = System.currentTimeMillis()
            if (fullContent == lastNotificationBody && (currentTime - lastNotificationTime) < 5000L) {
                Log.d(TAG, "Duplicate notification detected, skipping...")
                return
            }

            lastNotificationBody = fullContent
            lastNotificationTime = currentTime

            Log.d(TAG, "!!! TRANSACTION DETECTED !!! Sending to Gemini for parsing...")
            serviceScope.launch {
                // Send fullContent (Title + Body) to Gemini
                val transaction = GeminiParser.parseNotification(fullContent)

                if (transaction != null) {
                    if (TransactionDeduplicator.isDuplicate(transaction, "notification:$packageName")) {
                        return@launch
                    }

                    Log.d(TAG, "Gemini Parsed: ${transaction.amount} at ${transaction.merchantName} (${transaction.category})")

                    HttpSender.postTransaction(
                            context = this@RedexNotificationListener,
                            amount = transaction.amount,
                            date = transaction.date,
                            description = transaction.description,
                            merchantName = transaction.merchantName,
                            category = transaction.category,
                            source = "notification:$packageName",
                            type = transaction.type
                    )
                } else {
                    Log.d(TAG, "Gemini could not identify this as a transaction or failed to parse.")
                }
            }
        }
    }

    override fun onListenerConnected() {
        Log.d(TAG, "Notification Listener Service Connected!")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.e(TAG, "Notification Listener Service Disconnected!")
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        Log.d(TAG, "Notification Listener Destroyed!")
    }
}