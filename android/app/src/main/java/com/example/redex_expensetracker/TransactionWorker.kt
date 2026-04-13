package com.example.redex_expensetracker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

class TransactionWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val database = AppDatabase.getDatabase(applicationContext)
        val dao = database.transactionDao()
        val pending = dao.getAllPending()

        if (pending.isEmpty()) return Result.success()

        Log.d("RedexWorker", "Retrying ${pending.size} pending transactions...")

        var allSuccessful = true
        for (item in pending) {
            val success = try {
                HttpSender.sendToApi(
                    amount = item.amount,
                    date = item.date,
                    description = item.description,
                    merchantName = item.merchantName,
                    category = item.category,
                    source = item.source,
                    type = item.type,
                    timestamp = item.timestamp
                )
            } catch (e: Exception) {
                false
            }

            if (success) {
                dao.delete(item)
                Log.d("RedexWorker", "Successfully synced transaction: ${item.id}")
            } else {
                allSuccessful = false
            }
        }

        return if (allSuccessful) Result.success() else Result.retry()
    }

    companion object {
        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<TransactionWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueue(request)
        }
    }
}
