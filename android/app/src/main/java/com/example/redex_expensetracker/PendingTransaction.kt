package com.example.redex_expensetracker

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Delete
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import android.content.Context

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

@Dao
interface TransactionDao {
    @Insert
    suspend fun insert(transaction: PendingTransaction)

    @Query("SELECT * FROM pending_transactions ORDER BY timestamp ASC")
    suspend fun getAllPending(): List<PendingTransaction>

    @Delete
    suspend fun delete(transaction: PendingTransaction)
}

@Database(entities = [PendingTransaction::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun transactionDao(): TransactionDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "redex_database"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
