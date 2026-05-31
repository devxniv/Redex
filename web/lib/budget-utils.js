export const getNetBalances = (members, expenses = [], settlements = []) => {
  const acc = {};

  // Initialise — settled tracks amounts paid out by this person as settlements
  // (Note: this is one-directional — only counts what the person has paid out,
  // not what they've received, but the balance formula handles this correctly)
  members.forEach((m) => {
    acc[m.id] = { id: m.id, name: m.name, expensePaid: 0, paid: 0, owes: 0 };
  });

  // Single pass through expenses.
  expenses.forEach((e) => {
    if (acc[e.paidById]) {
      acc[e.paidById].expensePaid += Number(e.amount) || 0; // ← track separately
      acc[e.paidById].paid += Number(e.amount) || 0;
    }

    (e.splits || []).forEach((s) => {
      if (acc[s.memberId]) acc[s.memberId].owes += Number(s.amount) || 0;
    });
  });

  settlements.forEach((s) => {
    // fromId is the one paying the settlement
    if (acc[s.fromId]) acc[s.fromId].paid += Number(s.amount) || 0;
    // toId is the one receiving — treat it as them owing less
    if (acc[s.toId]) acc[s.toId].owes += Number(s.amount) || 0;
  });

  return Object.values(acc).map((b) => ({
    ...b,
    balance: Math.round((b.paid - b.owes) * 100) / 100,
  }));
};

export function simplifyDebts(participants) {
  const EPSILON = 0.01;

  // Work on a shallow copy so caller's array is never mutated.
  const balances = participants.map((p) => ({
    ...p,
    balance: Math.round((p.balance || 0) * 100) / 100,
  }));

  const transactions = [];

  // Cap at n² iterations — prevents an infinite loop if floating-point dust
  // keeps a balance just above EPSILON forever.
  const maxIterations = balances.length * balances.length;

  for (let i = 0; i < maxIterations; i++) {
    // Split into creditors (balance > 0) and debtors (balance < 0).
    const creditors = balances.filter((b) => b.balance > EPSILON);
    const debtors = balances.filter((b) => b.balance < -EPSILON);

    if (creditors.length === 0 || debtors.length === 0) break;

    // Greedily pair the largest creditor with the largest debtor each round.
    // This minimises the total number of transactions.
    const maxC = creditors.reduce((a, b) => (a.balance > b.balance ? a : b));
    const maxD = debtors.reduce((a, b) => (a.balance < b.balance ? a : b));

    const amount = Math.min(maxC.balance, -maxD.balance);
    if (amount < EPSILON) break;

    transactions.push({
      fromId: maxD.id,
      toId: maxC.id,
      from: maxD.name,
      to: maxC.name,
      amount: Math.round(amount * 100) / 100,
    });

    // Round after every mutation to prevent 0.000000x dust accumulation.
    maxC.balance = Math.round((maxC.balance - amount) * 100) / 100;
    maxD.balance = Math.round((maxD.balance + amount) * 100) / 100;
  }

  return transactions;
}
