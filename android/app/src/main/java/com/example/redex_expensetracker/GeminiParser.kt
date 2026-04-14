package com.example.redex_expensetracker

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import androidx.core.graphics.scale
import com.example.redex_expensetracker.BuildConfig
import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.BlockThreshold
import com.google.ai.client.generativeai.type.HarmCategory
import com.google.ai.client.generativeai.type.SafetySetting
import com.google.ai.client.generativeai.type.content
import com.google.ai.client.generativeai.type.generationConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object GeminiParser {
    private const val TAG = "GeminiParser"

    private val model by lazy {
        GenerativeModel(
            modelName = "gemini-3-flash-preview",
            apiKey = BuildConfig.GEMINI_API_KEY,
            generationConfig = generationConfig {
                responseMimeType = "application/json"
            },
            safetySettings = listOf(
                SafetySetting(HarmCategory.HARASSMENT, BlockThreshold.ONLY_HIGH),
                SafetySetting(HarmCategory.HATE_SPEECH, BlockThreshold.ONLY_HIGH),
                SafetySetting(HarmCategory.SEXUALLY_EXPLICIT, BlockThreshold.ONLY_HIGH),
                SafetySetting(HarmCategory.DANGEROUS_CONTENT, BlockThreshold.ONLY_HIGH)
            ),
            systemInstruction = content { 
                text("You are a financial data extractor. You MUST always return a single JSON object. NEVER return an array, even if you find multiple potential transactions. Pick the most relevant one.")
            }
        )
    }

    private fun getPromptPrefix(): String {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        return """
          Analyze this financial input. Today's date is $today.
          Identify the transaction and extract exactly one JSON object with these fields:
          {
            "amount": number,
            "date": "YYYY-MM-DD",
            "description": "string",
            "merchantName": "string",
            "category": "string",
            "is_transaction": boolean,
            "type": "EXPENSE" | "INCOME"
          }
          
          A transaction is anything where money is spent, received, or moved. 
          If you see an amount and a merchant/bank name, it IS a transaction.
          
          If the date is relative (e.g. "Today", "Yesterday", "2 days ago"), 
          convert it to YYYY-MM-DD based on today's date ($today).
          
          For the category field, you MUST return ONLY one of these exact values:
          housing, transportation, groceries, utilities, entertainment, food, 
          shopping, healthcare, education, personal, travel, insurance, gifts, 
          bills, other-expense.
          
          Examples:
          - Zomato, Swiggy, restaurant -> food
          - Uber, Ola, petrol, fuel -> transportation  
          - Amazon, Flipkart, clothes -> shopping
          - Electricity, water, recharge -> utilities
          - Netflix, movie, game -> entertainment
          - Hospital, pharmacy, medicine -> healthcare
          - Rent, maintenance -> housing
          - Salary, freelance -> personal
          - Flight, hotel, trip -> travel
          - Any UPI transfer to a person -> personal
          - Unknown -> other-expense

          Input: 
        """.trimIndent()
    }

    private fun normalizeCategory(raw: String?): String {
        val valid = setOf(
            "housing", "transportation", "groceries", "utilities",
            "entertainment", "food", "shopping", "healthcare",
            "education", "personal", "travel", "insurance",
            "gifts", "bills", "other-expense"
        )
        val cleaned = raw?.lowercase()?.trim() ?: return "other-expense"
        if (cleaned in valid) return cleaned

        // Fuzzy match common Gemini mistakes
        return when {
            cleaned.contains("food") || cleaned.contains("dining") ||
            cleaned.contains("restaurant") || cleaned.contains("swiggy") ||
            cleaned.contains("zomato") -> "food"

            cleaned.contains("transport") || (cleaned.contains("travel") &&
            cleaned.contains("local")) || cleaned.contains("uber") ||
            cleaned.contains("cab") || cleaned.contains("fuel") -> "transportation"

            cleaned.contains("shop") || cleaned.contains("amazon") ||
            cleaned.contains("flipkart") || cleaned.contains("cloth") -> "shopping"

            cleaned.contains("grocery") || cleaned.contains("grocer") ||
            cleaned.contains("supermarket") || cleaned.contains("bigbasket") -> "groceries"

            cleaned.contains("util") || cleaned.contains("electric") ||
            cleaned.contains("recharge") || cleaned.contains("broadband") -> "utilities"

            cleaned.contains("entertain") || cleaned.contains("netflix") ||
            cleaned.contains("movie") || cleaned.contains("ott") -> "entertainment"

            cleaned.contains("health") || cleaned.contains("medical") ||
            cleaned.contains("pharma") || cleaned.contains("hospital") ||
            cleaned.contains("doctor") -> "healthcare"

            cleaned.contains("transfer") || cleaned.contains("upi") ||
            cleaned.contains("sent") || cleaned.contains("personal") -> "personal"

            cleaned.contains("travel") || cleaned.contains("flight") ||
            cleaned.contains("hotel") || cleaned.contains("trip") -> "travel"

            cleaned.contains("bill") || cleaned.contains("emi") ||
            cleaned.contains("loan") -> "bills"

            cleaned.contains("insurance") || cleaned.contains("premium") -> "insurance"

            cleaned.contains("education") || cleaned.contains("school") ||
            cleaned.contains("college") || cleaned.contains("course") -> "education"

            cleaned.contains("gift") || cleaned.contains("donation") -> "gifts"

            cleaned.contains("rent") || cleaned.contains("maintenance") ||
            cleaned.contains("housing") -> "housing"

            else -> "other-expense"
        }
    }

    private fun extractJson(raw: String): String {
        val fenceRegex = Regex("```(?:json)?\\s*([\\s\\S]*?)```")
        val match = fenceRegex.find(raw)
        if (match != null) return match.groupValues[1].trim()
        return raw.trim()
    }

    private fun parseAmount(raw: Any?): Double {
        return when (raw) {
            is Number -> raw.toDouble()
            is String -> raw
                .replace(",", "")
                .replace(Regex("[^0-9.-]"), "")
                .toDoubleOrNull() ?: 0.0
            else -> 0.0
        }
    }

    private fun parseType(raw: String?): String {
        return when (raw?.uppercase()) {
            "INCOME" -> "INCOME"
            else -> "EXPENSE"
        }
    }

    private fun resizeBitmap(bitmap: Bitmap): Bitmap {
        val maxSize = 512
        var width = bitmap.width
        var height = bitmap.height

        val bitmapRatio = width.toFloat() / height.toFloat()
        if (bitmapRatio > 1) {
            width = maxSize
            height = (width / bitmapRatio).toInt()
        } else {
            height = maxSize
            width = (height * bitmapRatio).toInt()
        }
        return bitmap.scale(width, height, true)
    }

    suspend fun parseNotification(text: String): TransactionData? = withContext(Dispatchers.IO) {
        if (BuildConfig.GEMINI_API_KEY.isEmpty()) {
            Log.e(TAG, "Gemini API Key not set!")
            return@withContext null
        }

        return@withContext try {
            val response = model.generateContent(
                content {
                    text(getPromptPrefix() + text)
                }
            )

            val rawString = response.text ?: ""
            Log.d(TAG, "Raw Gemini response: $rawString")

            if (rawString.isEmpty()) {
                Log.e(TAG, "Empty response from Gemini")
                return@withContext null
            }

            val cleanedJson = extractJson(rawString)
            Log.d(TAG, "Cleaned JSON for notification: $cleanedJson")
            val json = JSONObject(cleanedJson)

            val isTransaction = json.optBoolean("is_transaction", false)
            val amount = parseAmount(json.opt("amount"))

            if (!isTransaction && amount <= 0) {
                Log.d(TAG, "Not a transaction (is_transaction=false AND amount=0).")
                return@withContext null
            }

            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            TransactionData(
                amount = amount,
                date = json.optString("date", today),
                description = json.optString("description", "No description"),
                merchantName = json.optString("merchantName", "Unknown"),
                category = normalizeCategory(json.optString("category")),
                type = parseType(json.optString("type"))
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing Gemini response: ${e.message}")
            null
        }
    }

    suspend fun parseFromImage(imageBytes: ByteArray): TransactionData? = withContext(Dispatchers.IO) {
        // Optimized bitmap decoding with inSampleSize to save memory
        val options = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }
        BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size, options)
        
        // Calculate inSampleSize
        val reqWidth = 512
        val reqHeight = 512
        var inSampleSize = 1
        if (options.outHeight > reqHeight || options.outWidth > reqWidth) {
            val halfHeight = options.outHeight / 2
            val halfWidth = options.outWidth / 2
            while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
                inSampleSize *= 2
            }
        }
        
        options.inJustDecodeBounds = false
        options.inSampleSize = inSampleSize
        
        val rawBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size, options) ?: return@withContext null
        
        try {
            // Compress directly to reduce payload size without double resize
            val outputStream = ByteArrayOutputStream()
            rawBitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
            val compressedBytes = outputStream.toByteArray()
            rawBitmap.recycle()

            val finalBitmap = BitmapFactory.decodeByteArray(compressedBytes, 0, compressedBytes.size) ?: return@withContext null

            val prompt = getPromptPrefix() + """
                This is a screenshot from a UPI or banking app.
                It could be a payment sent (EXPENSE) OR money received (INCOME).
                Look carefully at the screen:
                - If it shows "You paid", "Paid to", "Sent to", "Debited" → type is EXPENSE
                - If it shows "You received", "Received from", "Credited", "paid you" → type is INCOME
                Determine the correct type from the actual content, do NOT assume.
                Return a single JSON object, NOT an array.
            """.trimIndent()

            try {
                var lastException: Exception? = null
                repeat(3) { attempt ->
                    try {
                        val response = model.generateContent(content {
                            image(finalBitmap)
                            text(prompt)
                        })

                        val rawString = response.text?.trim() ?: return@repeat
                        Log.d(TAG, "Raw Gemini image response (Attempt ${attempt + 1}): $rawString")

                        val cleanedJson = extractJson(rawString)

                        val json = if (cleanedJson.startsWith("[")) {
                            val arr = org.json.JSONArray(cleanedJson)
                            if (arr.length() == 0) return@repeat
                            arr.getJSONObject(0)
                        } else {
                            JSONObject(cleanedJson)
                        }

                        if (!json.optBoolean("is_transaction", false)) return@withContext null

                        return@withContext TransactionData(
                            amount = parseAmount(json.opt("amount")),
                            date = json.optString("date", ""),
                            description = json.optString("description", "No description"),
                            merchantName = json.optString("merchantName", "Unknown"),
                            category = normalizeCategory(json.optString("category")),
                            type = parseType(json.optString("type"))
                        )
                    } catch (e: Exception) {
                        lastException = e
                        Log.w(TAG, "Attempt ${attempt + 1} failed: ${e.message}")
                        if (attempt < 2) delay(2000L)
                    }
                }
                Log.e(TAG, "All attempts failed: ${lastException?.message}")
                null
            } finally {
                finalBitmap.recycle()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Bitmap processing error: ${e.message}")
            null
        }
    }
}

data class TransactionData(
    val amount: Double,
    val date: String,
    val description: String,
    val merchantName: String,
    val category: String,
    val type: String
)
