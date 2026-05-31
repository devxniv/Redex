"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function getAuthenticatedUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (!user) throw new Error("User not found");

  return user;
}

export async function getOrCreateGroup() {
  const user = await getAuthenticatedUser();

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
        name: "My Group",
        members: {
          // Use the user's display name if set, otherwise a generic label
          create: [{ name: user.name || "Group Member" }],
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
  const user = await getAuthenticatedUser();

  if (!groupId) throw new Error("Group ID is required");
  if (!name?.trim()) throw new Error("Name is required");

  const group = await db.budgetGroup.findFirst({
    where: { id: groupId, userId: user.id },
  });
  if (!group) throw new Error("Group not found or access denied");

  const member = await db.budgetMember.create({
    data: { name: name.trim(), groupId },
  });

  revalidatePath("/budget-splitter");
  return member;
}

export async function updateMember(memberId, name) {
  const user = await getAuthenticatedUser();

  if (!memberId) return;

  const member = await db.budgetMember.findUnique({
    where: { id: memberId },
    include: { group: { select: { userId: true } } },
  });
  if (!member || member.group.userId !== user.id) {
    throw new Error("Member not found or access denied");
  }

  // The P2025 catch below is technically unreachable in the race-condition
  // case (deleted between findUnique and update) because the ownership check
  // above throws first. Kept for safety in case query logic changes.
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
  const user = await getAuthenticatedUser();

  if (!memberId) throw new Error("Member ID is required");

  const member = await db.budgetMember.findUnique({
    where: { id: memberId },
    include: { group: { select: { userId: true } } },
  });
  if (!member || member.group.userId !== user.id) {
    throw new Error("Member not found or access denied");
  }

  try {
    // Identify expenses paid by this member so their splits can be cleaned up
    const expensesPaidByMember = await db.budgetExpense.findMany({
      where: { paidById: memberId },
      select: { id: true },
    });
    const expenseIds = expensesPaidByMember.map((e) => e.id);

    await db.$transaction([
      // Delete splits where this member participated OR whose expense they paid.
      // Combined into one OR query to avoid a double-delete P2025 on overlapping rows.
      db.budgetSplit.deleteMany({
        where: {
          OR: [{ memberId }, { expenseId: { in: expenseIds } }],
        },
      }),
      // Delete settlements involving this member
      db.budgetSettlement.deleteMany({
        where: { OR: [{ fromId: memberId }, { toId: memberId }] },
      }),
      // Delete expenses paid by this member
      db.budgetExpense.deleteMany({ where: { paidById: memberId } }),
      // Finally remove the member itself
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
  const user = await getAuthenticatedUser();

  if (!expense?.desc || !expense?.paidById || !expense?.splits?.length) {
    throw new Error("Invalid expense data");
  }

  // Verify the group belongs to this user
  const group = await db.budgetGroup.findFirst({
    where: { id: groupId, userId: user.id },
  });
  if (!group) throw new Error("Group not found or access denied");

  // Validate total expense amount
  const parsedAmount = Number(expense.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  // Verify payer belongs to this group
  const payerExists = await db.budgetMember.findUnique({
    where: { id: expense.paidById, groupId },
    select: { id: true },
  });
  if (!payerExists) {
    throw new Error(
      "Payer not found in this group — member may still be saving",
    );
  }

  // Validate split amounts before hitting the DB
  expense.splits.forEach((s, idx) => {
    const splitAmt = Number(s.amount);
    if (!Number.isFinite(splitAmt) || splitAmt <= 0) {
      throw new Error(`Split ${idx + 1}: amount must be a positive number`);
    }
  });

  // Verify all split members exist within this group (deduplicate first to
  // avoid a false length mismatch when the same member appears twice)
  const splitMemberIds = expense.splits.map((s) => s.memberId);
  const uniqueSplitMemberIds = [...new Set(splitMemberIds)];
  const existingMembers = await db.budgetMember.findMany({
    where: { id: { in: uniqueSplitMemberIds }, groupId },
    select: { id: true },
  });
  if (existingMembers.length !== uniqueSplitMemberIds.length) {
    throw new Error("One or more split members not found in this group");
  }

  const created = await db.budgetExpense.create({
    data: {
      desc: expense.desc.trim(),
      amount: parsedAmount,
      category: expense.category || "📦 Other",
      paidById: expense.paidById,
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
  const user = await getAuthenticatedUser();

  if (!expenseId) throw new Error("Expense ID is required");

  const expense = await db.budgetExpense.findUnique({
    where: { id: expenseId },
    include: { group: { select: { userId: true } } },
  });
  if (!expense || expense.group.userId !== user.id) {
    throw new Error("Expense not found or access denied");
  }

  // Delete splits first; remove this transaction if your schema uses onDelete: Cascade
  await db.$transaction([
    db.budgetSplit.deleteMany({ where: { expenseId } }),
    db.budgetExpense.delete({ where: { id: expenseId } }),
  ]);

  revalidatePath("/budget-splitter");
}

export async function markSettlementAsPaid(groupId, fromId, toId, amount) {
  const user = await getAuthenticatedUser();

  // Prevent nonsensical self-settlement before any DB work
  if (fromId === toId) {
    throw new Error("Cannot settle a payment with yourself");
  }

  const group = await db.budgetGroup.findFirst({
    where: { id: groupId, userId: user.id },
  });
  if (!group) throw new Error("Group not found or access denied");

  // Confirm both parties are members of this group
  const members = await db.budgetMember.findMany({
    where: { groupId, id: { in: [fromId, toId] } },
    select: { id: true },
  });
  if (members.length !== 2) {
    throw new Error("One or both settlement members not found in group");
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  await db.budgetSettlement.create({
    data: {
      groupId,
      fromId,
      toId,
      amount: parsedAmount,
      settledAt: new Date(),
    },
  });

  revalidatePath("/budget-splitter");
  return { success: true };
}

export async function removeSettlement(groupId, fromId, toId) {
  const user = await getAuthenticatedUser();

  const group = await db.budgetGroup.findFirst({
    where: { id: groupId, userId: user.id },
  });
  if (!group) throw new Error("Group not found or access denied");

  // Delete only the most recent settlement for this pair so that partial
  // payments accumulate correctly (one undo = one payment reversed).
  // Uses settledAt for ordering — cuid2 IDs are not time-ordered.
  const latest = await db.budgetSettlement.findFirst({
    where: { groupId, fromId, toId },
    orderBy: { settledAt: "desc" },
  });

  if (latest) {
    await db.budgetSettlement.delete({ where: { id: latest.id } });
  }

  revalidatePath("/budget-splitter");
  return { success: true };
}

export async function deleteSettlement(groupId, fromId, toId) {
  const user = await getAuthenticatedUser();

  const group = await db.budgetGroup.findFirst({
    where: { id: groupId, userId: user.id },
  });
  if (!group) throw new Error("Group not found or access denied");

  await db.budgetSettlement.deleteMany({
    where: { groupId, fromId, toId },
  });

  return { success: true };
}
