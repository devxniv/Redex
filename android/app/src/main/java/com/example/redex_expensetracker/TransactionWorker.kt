package com.example.redex_expensetracker

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

class TransactionWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val dao = AppDatabase.getDatabase(applicationContext).transactionDao()
        val pending = dao.getAllPending()

        for (transaction in pending) {
            val success = HttpSender.sendToApi(
                amount = transaction.amount,
                date = transaction.date,
                description = transaction.description,
                merchantName = transaction.merchantName,
                category = transaction.category,
                source = transaction.source,
                type = transaction.type,
                timestamp = transaction.timestamp
            )
            if (success) dao.delete(transaction)
        }
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val request = OneTimeWorkRequestBuilder<TransactionWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "transaction_retry",
                ExistingWorkPolicy.KEEP,
                request
            )
        }
    }
}
