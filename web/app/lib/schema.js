import { z } from "zod";

export const accountSchema = z.object({
  name: z.string().min(1, "Account name is required"),
  type: z.enum(["CURRENT", "SAVINGS"], {
    required_error: "Account type is required",
  }),
  balance: z
    .string()
    .min(1, "Initial balance is required")
    .transform((val) => val.trim())
    .pipe(
      z.string().regex(/^\d+(\.\d{1,2})?$/, "Balance must be a valid number"),
    )
    .transform((val) => parseFloat(val)),
  isDefault: z.boolean().default(false),
});

export const transactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"], {
      required_error: "Transaction type is required",
    }),
    amount: z
      .string()
      .min(1, "Amount is required")
      .transform((val) => val.trim())
      .pipe(
        z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a valid number"),
      )
      .transform((val) => parseFloat(val)),

    description: z.string().trim().optional().default(""),

    // Fix for date input from forms
    date: z
      .string({ required_error: "Date is required" })
      .pipe(z.coerce.date()), // Safely converts string → Date

    accountId: z.string().min(1, "Account is required"),

    category: z.string().min(1, "Category is required"),

    isRecurring: z.boolean().default(false),

    recurringInterval: z
      .enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isRecurring && !data.recurringInterval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring interval is required for recurring transactions",
        path: ["recurringInterval"],
      });
    }
  });
