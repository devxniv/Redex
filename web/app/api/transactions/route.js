import { db } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(req) {
  try {
    const body = await req.json();

    // ✅ Clean structured fields — no more string parsing
    const numericAmount = parseFloat(body.amount) || 0;
    const category = (body.category || "other-expense").toLowerCase();
    const description = `${body.merchantName}: ${body.description}`;
    const date = body.date ? new Date(body.date) : new Date();

    // DEMO IDs stay the same
    const DEMO_USER_ID = "e50a2257-1988-400f-9c8c-1070cadec229";
    const DEMO_ACCOUNT_ID = "0b0e67cb-9f46-4301-9771-e240f68a2aaf";

    const transaction = await db.$transaction(async (tx) => {
      const newTransaction = await tx.transaction.create({
        data: {
          amount: numericAmount,
          description: description,
          date: date,
          type: body.type === "INCOME" ? "INCOME" : "EXPENSE",
          category: category,
          status: "COMPLETED",
          userId: DEMO_USER_ID,
          accountId: DEMO_ACCOUNT_ID,
        },
      });

      await tx.account.update({
        where: { id: DEMO_ACCOUNT_ID },
        data: { balance: { decrement: numericAmount } },
      });

      return newTransaction;
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${DEMO_ACCOUNT_ID}`, "page");

    return NextResponse.json(
      { success: true, data: transaction },
      { status: 201 },
    );
  } catch (error) {
    console.error("Redex Mobile Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
