package com.example.redex_expensetracker

import androidx.room.*

@Dao
interface TransactionDao {
    @Insert
    suspend fun insert(transaction: PendingTransaction)

    @Query("SELECT * FROM pending_transactions ORDER BY timestamp ASC")
    suspend fun getAllPending(): List<PendingTransaction>

    @Delete
    suspend fun delete(transaction: PendingTransaction)
}
