/**
 * Email data validation utilities
 * Ensures complete and valid data before rendering email templates
 */

import { z } from "zod";

// Monthly Report schema
const MonthlyReportSchema = z.object({
  userName: z.string().min(1, "User name is required"),
  data: z.object({
    stats: z.object({
      totalIncome: z.number().min(0).default(0),
      totalExpenses: z.number().min(0).default(0),
      byCategory: z.record(z.number().min(0)).default({}),
      transactionCount: z.number().min(0).default(0),
    }),
    month: z.string().min(1, "Month is required"),
    insights: z.array(z.string()).min(0).default([]),
  }),
});

// Budget Alert schema
const BudgetAlertSchema = z.object({
  userName: z.string().min(1, "User name is required"),
  data: z.object({
    percentageUsed: z.number().min(0).max(100),
    budgetAmount: z.string().or(z.number()),
    totalExpenses: z.string().or(z.number()),
    accountName: z.string().min(1, "Account name is required"),
  }),
});

/**
 * Validates monthly report data
 * @param {Object} input - Data to validate
 * @returns {Object} - Validated data with defaults
 * @throws {Error} - If validation fails
 */
export function validateMonthlyReportData(input) {
  try {
    return MonthlyReportSchema.parse(input);
  } catch (error) {
    const message = `Monthly report validation failed: ${error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ")}`;
    throw new Error(message);
  }
}

/**
 * Validates budget alert data
 * @param {Object} input - Data to validate
 * @returns {Object} - Validated data
 * @throws {Error} - If validation fails
 */
export function validateBudgetAlertData(input) {
  try {
    return BudgetAlertSchema.parse(input);
  } catch (error) {
    const message = `Budget alert validation failed: ${error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ")}`;
    throw new Error(message);
  }
}

/**
 * Safe wrapper for email rendering
 * Returns null if validation fails, allowing graceful error handling
 * @param {Object} props - Email component props
 * @param {string} props.type - Email template type
 * @param {Object} props.data - Email data
 * @param {string} props.userName - User name
 * @returns {Object|null} - Validated props or null
 */
export function validateEmailData({ type, data, userName }) {
  try {
    if (type === "monthly-report") {
      return validateMonthlyReportData({ userName, data });
    } else if (type === "budget-alert") {
      return validateBudgetAlertData({ userName, data });
    }
    throw new Error(`Unknown email type: ${type}`);
  } catch (error) {
    console.error(`Email validation error for ${type}:`, error.message);
    return null;
  }
}
