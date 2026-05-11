import { db } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(req) {
  const apiSecret = req.headers.get("x-redex-api-secret");
  console.log("Received secret:", apiSecret);
  console.log("Expected secret:", process.env.REDEX_API_SECRET);
  try {
    // API Secret validation
    const apiSecret = req.headers.get("x-redex-api-secret");
    if (apiSecret !== process.env.REDEX_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const numericAmount = parseFloat(body.amount) || 0;
    const category = (body.category || "other-expense").toLowerCase();
    const description = `${body.merchantName}: ${body.description}`;
    const date = body.date ? new Date(body.date) : new Date();
    const type = body.type === "INCOME" ? "INCOME" : "EXPENSE";

    // ✅ Look up real user from DB
    const user = await db.user.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No user found in database" },
        { status: 404 },
      );
    }

    // ✅ Look up their default account
    const defaultAccount = await db.account.findFirst({
      where: { userId: user.id, isDefault: true },
    });

    if (!defaultAccount) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No default account found. Please create one in the dashboard.",
        },
        { status: 404 },
      );
    }

    const transaction = await db.$transaction(async (tx) => {
      const newTransaction = await tx.transaction.create({
        data: {
          amount: numericAmount,
          description: description,
          date: date,
          type: type,
          category: category,
          status: "COMPLETED",
          userId: user.id, // ✅ real user
          accountId: defaultAccount.id, // ✅ real account
        },
      });

      // ✅ Correctly increment OR decrement based on type
      await tx.account.update({
        where: { id: defaultAccount.id },
        data: {
          balance: {
            [type === "EXPENSE" ? "decrement" : "increment"]: numericAmount,
          },
        },
      });

      return newTransaction;
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${defaultAccount.id}`, "page");

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
