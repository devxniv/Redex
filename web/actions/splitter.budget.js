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
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name cannot be empty");

  const member = await db.budgetMember.create({
    data: {
      name: trimmedName,
      groupId,
    },
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
    // FIX #2: Correct deletion order to avoid FK constraint violations.

    // Step 1: Delete all splits where this member is a participant
    await db.budgetSplit.deleteMany({ where: { memberId } });

    // Step 2: Delete splits that belong to expenses this member PAID FOR
    // (child records must go before parent expenses)
    const expensesPaidByMember = await db.budgetExpense.findMany({
      where: { paidBy: memberId },
      select: { id: true },
    });
    const expenseIds = expensesPaidByMember.map((e) => e.id);
    if (expenseIds.length > 0) {
      await db.budgetSplit.deleteMany({
        where: { expenseId: { in: expenseIds } },
      });
    }

    // Step 3: Delete all settlements where they are involved
    await db.budgetSettlement.deleteMany({
      where: { OR: [{ fromId: memberId }, { toId: memberId }] },
    });

    // Step 4: Delete all expenses that this member paid for
    await db.budgetExpense.deleteMany({ where: { paidBy: memberId } });

    // Step 5: Now that all links are gone, delete the member
    await db.budgetMember.delete({ where: { id: memberId } });

    revalidatePath("/budget-splitter");
  } catch (error) {
    if (error.code === "P2025") {
      console.warn(`Member ${memberId} already deleted`);
      revalidatePath("/budget-splitter");
      return;
    }
    console.error("Prisma Delete Error:", error);
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

  if (!groupId || !fromId || !toId || !amount) {
    throw new Error("Missing required fields for settlement");
  }

  const currentUser = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: { id: true },
  });

  if (!currentUser) throw new Error("User not found");

  const group = await db.budgetGroup.findUnique({
    where: { id: groupId, userId: currentUser.id },
  });

  if (!group) throw new Error("Group not found or unauthorized");

  try {
    const existing = await db.budgetSettlement.findFirst({
      where: { groupId, fromId, toId },
    });

    if (existing) {
      await db.budgetSettlement.update({
        where: { id: existing.id },
        data: { amount: Number(amount), settledAt: new Date() },
      });
    } else {
      await db.budgetSettlement.create({
        data: { groupId, fromId, toId, amount: Number(amount) },
      });
    }
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

  if (!groupId || !fromId || !toId) {
    throw new Error("Missing required fields for removeSettlement");
  }

  try {
    // FIX #1 (cont): Use findFirst + delete by id instead of the composite
    // unique key, for the same reason as markSettlementAsPaid above.
    const existing = await db.budgetSettlement.findFirst({
      where: { groupId, fromId, toId },
    });

    if (existing) {
      await db.budgetSettlement.delete({ where: { id: existing.id } });
    } else {
      console.warn("Settlement already removed");
    }
  } catch (error) {
    if (error.code === "P2025") {
      console.warn("Settlement already removed");
    } else {
      console.error("Error removing settlement:", error);
      throw error;
    }
  }

  revalidatePath("/budget-splitter");
  return { success: true };
}
