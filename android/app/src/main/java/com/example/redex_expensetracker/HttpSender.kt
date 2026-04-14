package com.example.redex_expensetracker

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import android.content.Context

object HttpSender {

    private const val TAG = "RedexHTTP"
    private const val SERVER_URL = BuildConfig.SERVER_URL;

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    /**
     * The main entry point for the app. Tries to send immediately. 
     * If it fails (offline), it saves to the local DB for background retry.
     */
    suspend fun postTransaction(
        context: Context,
        amount: Double,
        date: String,
        description: String,
        merchantName: String,
        category: String,
        source: String,
        type: String
    ) = withContext(Dispatchers.IO) {
        val timestamp = System.currentTimeMillis()

        val success = sendToApi(
            amount, date, description, merchantName, category, source, type, timestamp
        )

        if (!success) {
            Log.d(TAG, "Offline/Failure. Saving to local queue...")
            val dao = AppDatabase.getDatabase(context).transactionDao()
            dao.insert(
                PendingTransaction(
                    amount = amount,
                    date = date,
                    description = description,
                    merchantName = merchantName,
                    category = category,
                    source = source,
                    type = type,
                    timestamp = timestamp
                )
            )
            // Schedule the background worker to retry when online
            TransactionWorker.schedule(context)
        }
    }

    /**
     * Pure API call logic. Returns true if the server confirmed success.
     */
    suspend fun sendToApi(
        amount: Double,
        date: String,
        description: String,
        merchantName: String,
        category: String,
        source: String,
        type: String,
        timestamp: Long
    ): Boolean = withContext(Dispatchers.IO) {
        val json = try {
            JSONObject().apply {
                put("amount", amount)
                put("date", date)
                put("description", description)
                put("merchantName", merchantName)
                put("category", category)
                put("source", source)
                put("type", type)
                put("timestamp", timestamp)
            }.toString()
        } catch (_: Exception) {
            return@withContext false
        }

        val requestBody = json.toRequestBody("application/json".toMediaTypeOrNull())
        val request = try {
            Request.Builder()
                .url(SERVER_URL)
                .header("User-Agent", "Redex-Android")
                .header("X-Redex-Api-Secret", BuildConfig.REDEX_API_SECRET)
                .post(requestBody)
                .build()
        } catch (_: Exception) {
            return@withContext false
        }

        return@withContext try {
            client.newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed: ${e.message}")
            false
        }
    }
}
