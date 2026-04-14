package com.example.redex_expensetracker

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.IntentCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

class ShareReceiverActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "RedexShare"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Safety 3: Anti-Spam Rate Limiting
        if (!ShareGuard.canProcess()) {
            Toast.makeText(this, "Please wait a moment", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        if (intent?.action == Intent.ACTION_SEND && intent.type?.startsWith("image/") == true) {
            handleSharedImage(intent)
        } else {
            finish()
        }
    }

    private fun handleSharedImage(intent: Intent) {
        val imageUri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        
        // Whitelist Enforcement
        val referrerPkg = referrer?.host ?: ""
        val callingPkg = (callingActivity?.packageName ?: referrerPkg).trim()
        
        Log.d(TAG, "Share request from: '$callingPkg' (Referrer: $referrer)")

        // If we identify the app and it's NOT whitelisted, block it.
        if (callingPkg.isNotEmpty() && !WhitelistManager.isWhitelisted(this, callingPkg)) {
            Log.w(TAG, "Blocked share from non-whitelisted app: $callingPkg")
            Toast.makeText(this, "App ($callingPkg) is not whitelisted in Redex", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        
        // If we can't identify the app, we log a warning but proceed to avoid blocking legitimate apps
        if (callingPkg.isEmpty()) {
            Log.w(TAG, "Proceeding with unknown source (Package name could not be determined)")
        }

        if (imageUri != null) {
            Log.d(TAG, "Received shared image: $imageUri")
            
            lifecycleScope.launch {
                try {
                    // Safety 2: File Size "Sanity Check" (Max 5MB)
                    val fileSize = withContext(Dispatchers.IO) {
                        contentResolver.openFileDescriptor(imageUri, "r")?.use { 
                            it.statSize 
                        } ?: 0
                    }
                    
                    if (fileSize > 5 * 1024 * 1024) {
                        Toast.makeText(this@ShareReceiverActivity, "File too large (Max 5MB)", Toast.LENGTH_SHORT).show()
                        finish()
                        return@launch
                    }

                    // Scoped processing with a timeout
                    withTimeout(20000) { // 20 second timeout
                        val bytes = withContext(Dispatchers.IO) {
                            contentResolver.openInputStream(imageUri)?.use { stream ->
                                stream.readBytes()
                            }
                        }

                        if (bytes != null) {
                            Toast.makeText(this@ShareReceiverActivity, "Analyzing Receipt...", Toast.LENGTH_SHORT).show()
                            val transaction = GeminiParser.parseFromImage(bytes)
                            
                            if (transaction != null) {
                                if (TransactionDeduplicator.isDuplicate(transaction, "share:screenshot")) {
                                    Toast.makeText(this@ShareReceiverActivity, "Duplicate Transaction Detected", Toast.LENGTH_SHORT).show()
                                    finish()
                                    return@withTimeout
                                }

                                // Safety 5: User Confirmation
                                showConfirmationDialog(transaction)
                            } else {
                                Toast.makeText(this@ShareReceiverActivity, "Could not parse receipt", Toast.LENGTH_SHORT).show()
                                finish()
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing shared image: ${e.message}")
                    Toast.makeText(this@ShareReceiverActivity, "Processing failed", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        } else {
            finish()
        }
    }

    private fun showConfirmationDialog(transaction: TransactionData) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Confirm Transaction")
            .setMessage("Amount: ₹${transaction.amount}\nMerchant: ${transaction.merchantName}\nCategory: ${transaction.category}\nDate: ${transaction.date}")
            .setPositiveButton("Save") { _, _ ->
                lifecycleScope.launch {
                    HttpSender.postTransaction(
                        context = this@ShareReceiverActivity,
                        amount = transaction.amount,
                        date = transaction.date,
                        description = transaction.description,
                        merchantName = transaction.merchantName,
                        category = transaction.category,
                        source = "share:screenshot",
                        type = transaction.type
                    )
                    Toast.makeText(this@ShareReceiverActivity, "Transaction Added!", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
            .setNegativeButton("Cancel") { _, _ ->
                finish()
            }
            .setCancelable(false)
            .show()
    }
}
