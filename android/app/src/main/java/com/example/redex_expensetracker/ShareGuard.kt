package com.example.redex_expensetracker

object ShareGuard {
    private var lastShareTime = 0L
    private const val COOLDOWN_MS = 3000L // 3 second cooldown

    fun canProcess(): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastShareTime < COOLDOWN_MS) return false
        lastShareTime = now
        return true
    }
}
