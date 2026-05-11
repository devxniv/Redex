"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Get or create a group for this user
export async function getOrCreateGroup() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  let group = await db.budgetGroup.findFirst({
    where: { userId: user.id },
    include: {
      members: true,
      expenses: {
        include: { splits: true },
        orderBy: { createdAt: "desc" },
      },
      settlements: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!group) {
    group = await db.budgetGroup.create({
      data: {
        userId: user.id,
        members: {
          create: [{ name: user.name || "You" }],
        },
      },
      include: {
        members: true,
        expenses: { include: { splits: true } },
        settlements: true,
      },
    });
  }

  return group;
}

export async function addMember(groupId, name = "") {
  const session = await auth();
  const userId = session?.userId;

  if (!userId) throw new Error("Unauthorized");
  if (!groupId) throw new Error("Group ID is required");

  // FIX #6: Guard against empty names at the server level

  const member = await db.budgetMember.create({
    data: { name: name.trim() || "", groupId },
  });
  revalidatePath("/budget-splitter");
  return member;
}

export async function updateMember(memberId, name) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  if (!memberId) return;

  try {
    await db.budgetMember.update({
      where: { id: memberId },
      data: { name: (name || "").trim() || "New Member" },
    });

    revalidatePath("/budget-splitter");
  } catch (error) {
    if (error.code === "P2025") {
      console.warn(`Member ${memberId} no longer exists (likely deleted)`);
      revalidatePath("/budget-splitter");
      return;
    }
    throw error;
  }
}

export async function removeMember(memberId) {
  const authData = await auth();
  const userId = authData.userId;

  if (!userId) throw new Error("Unauthorized");
  if (!memberId) throw new Error("Member ID is required");

  try {
    // 1. Identify expenses paid by this member to clean up their splits first
    const expensesPaidByMember = await db.budgetExpense.findMany({
      where: { paidBy: memberId },
      select: { id: true },
    });
    const expenseIds = expensesPaidByMember.map((e) => e.id);

    // 2. Wrap all deletions in a $transaction
    await db.$transaction([
      // Step A: Delete splits where this member was a participant
      db.budgetSplit.deleteMany({ where: { memberId } }),

      // Step B: Delete splits belonging to expenses this member paid for
      db.budgetSplit.deleteMany({
        where: { expenseId: { in: expenseIds } },
      }),

      // Step C: Delete all settlements involving this member
      db.budgetSettlement.deleteMany({
        where: { OR: [{ fromId: memberId }, { toId: memberId }] },
      }),

      // Step D: Delete all expenses paid by this member
      db.budgetExpense.deleteMany({ where: { paidBy: memberId } }),

      // Step E: Finally, delete the member itself
      db.budgetMember.delete({ where: { id: memberId } }),
    ]);

    revalidatePath("/budget-splitter");
    return { success: true };
  } catch (error) {
    if (error.code === "P2025") {
      console.warn(`Member ${memberId} already deleted`);
      revalidatePath("/budget-splitter");
      return;
    }
    console.error("Prisma Transaction Delete Error:", error);
    throw error;
  }
}

export async function addExpense(groupId, expense) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  if (!expense?.desc || !expense?.paidBy || !expense?.splits?.length) {
    throw new Error("Invalid expense data");
  }

  const memberExists = await db.budgetMember.findUnique({
    where: { id: expense.paidBy },
    select: { id: true },
  });

  if (!memberExists) {
    throw new Error(`Member ${expense.paidBy} not found — may still be saving`);
  }

  const created = await db.budgetExpense.create({
    data: {
      desc: expense.desc.trim(),
      amount: Number(expense.amount),
      category: expense.category || "📦 Other",
      paidBy: expense.paidBy,
      groupId,
      splits: {
        create: expense.splits.map((s) => ({
          memberId: s.memberId,
          amount: Number(s.amount),
        })),
      },
    },
  });

  revalidatePath("/budget-splitter");
  return created;
}

export async function removeExpense(expenseId) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  if (!expenseId) throw new Error("Expense ID is required");

  await db.budgetExpense.delete({ where: { id: expenseId } });

  revalidatePath("/budget-splitter");
}

// FIX #1: Replace the broken upsert with an explicit find → update/create
// to avoid relying on the Prisma-generated composite key name, which varies
// between schema versions and can cause a runtime crash.
export async function markSettlementAsPaid(groupId, fromId, toId, amount) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  // Always create a new record so partial payments accumulate
  try {
    await db.budgetSettlement.create({
      data: {
        groupId,
        fromId,
        toId,
        amount: Number(amount),
        settledAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Failed to mark settlement as paid:", error);
    throw error;
  }

  revalidatePath("/budget-splitter");
  return { success: true };
}

export async function removeSettlement(groupId, fromId, toId) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  try {
    // Find only the latest payment for this specific pair
    const latest = await db.budgetSettlement.findFirst({
      where: { groupId, fromId, toId },
      orderBy: { id: "desc" }, // ✅ cuid ids are time-ordered
    });

    if (latest) {
      await db.budgetSettlement.delete({ where: { id: latest.id } });
    }
  } catch (error) {
    console.error("Error removing settlement:", error);
    throw error;
  }

  revalidatePath("/budget-splitter");
  return { success: true };
}
