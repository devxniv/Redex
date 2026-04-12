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

class ShareReceiverActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "RedexShare"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (intent?.action == Intent.ACTION_SEND && intent.type?.startsWith("image/") == true) {
            handleSharedImage(intent)
        } else {
            finish()
        }
    }

    private fun handleSharedImage(intent: Intent) {
        val imageUri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        if (imageUri != null) {
            Log.d(TAG, "Received shared image: $imageUri")
            
            lifecycleScope.launch {
                try {
                    val bytes = withContext(Dispatchers.IO) {
                        contentResolver.openInputStream(imageUri)?.use { stream ->
                            stream.readBytes()
                        }
                    }

                    if (bytes != null) {
                        Toast.makeText(this@ShareReceiverActivity, "Processing Receipt...", Toast.LENGTH_SHORT).show()
                        val transaction = GeminiParser.parseFromImage(bytes)
                        
                        if (transaction != null) {
                            if (TransactionDeduplicator.isDuplicate(transaction, "share:screenshot")) {
                                finish()
                                return@launch
                            }

                            HttpSender.postTransaction(
                                amount = transaction.amount,
                                date = transaction.date,
                                description = transaction.description,
                                merchantName = transaction.merchantName,
                                category = transaction.category,
                                source = "share:screenshot",
                                type = transaction.type
                            )
                            Toast.makeText(this@ShareReceiverActivity, "Transaction Added: ₹${transaction.amount}", Toast.LENGTH_LONG).show()
                        } else {
                            Toast.makeText(this@ShareReceiverActivity, "Could not parse receipt", Toast.LENGTH_SHORT).show()
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing shared image: ${e.message}")
                } finally {
                    finish()
                }
            }
        } else {
            finish()
        }
    }
}