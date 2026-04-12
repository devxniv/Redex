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

object HttpSender {

    private const val TAG = "RedexHTTP"
    
    // Hardcoded Ngrok URL
    private const val SERVER_URL = "https://confining-unsightly-conclude.ngrok-free.dev/api/transactions"

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    suspend fun postTransaction(
        amount: Double,
        date: String,
        description: String,
        merchantName: String,
        category: String,
        source: String,
        type: String
    ) = withContext(Dispatchers.IO) {

        val json = try {
            JSONObject().apply {
                put("amount", amount)
                put("date", date)
                put("description", description)
                put("merchantName", merchantName)
                put("category", category)
                put("source", source)
                put("type", type)
                put("timestamp", System.currentTimeMillis())
            }.toString()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create JSON: ${e.message}")
            return@withContext
        }

        val requestBody = json.toRequestBody(
            "application/json; charset=utf-8".toMediaTypeOrNull()
        )

        val request = try {
            Request.Builder()
                .url(SERVER_URL)
                .header("User-Agent", "Redex-Android-App")
                .post(requestBody)
                .build()
        } catch (e: IllegalArgumentException) {
            Log.e(TAG, "Malformed URL: $SERVER_URL", e)
            return@withContext
        }

        try {
            Log.d(TAG, "Sending transaction to $SERVER_URL: $json")
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    Log.d(TAG, "Transaction saved: HTTP ${response.code}")
                } else {
                    Log.e(TAG, "Server error: ${response.code} | ${response.message}")
                }
            }
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "Timeout: Is the server running at $SERVER_URL?")
        } catch (e: Exception) {
            Log.e(TAG, "Send failed: ${e.javaClass.simpleName} - ${e.message}")
        }
    }
}