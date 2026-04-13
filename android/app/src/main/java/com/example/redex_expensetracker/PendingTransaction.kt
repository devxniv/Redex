package com.example.redex_expensetracker

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_transactions")
data class PendingTransaction(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val amount: Double,
    val date: String,
    val description: String,
    val merchantName: String,
    val category: String,
    val source: String,
    val type: String,
    val timestamp: Long
)