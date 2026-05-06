// ─────────────────────────────────────────────────────────────────────────────
// getNetBalances
//
// Returns an array of { id, name, paid, owes, settled, balance } — one entry
// per member.  `balance` is the net position after all expenses AND all
// settlements:  positive = is owed money,  negative = still owes money.
//
// Settlement accounting
// ─────────────────────
// Each settlement record { fromId, toId, amount } represents a completed
// cash transfer.  We model it symmetrically:
//   • the payer   (fromId) gets a POSITIVE adjustment  → reduces what they owe
//   • the payee   (toId)   gets a NEGATIVE adjustment  → reduces what they're owed
//
// Multiple partial settlements between the same pair accumulate naturally
// because we sum every record individually — there is no "exact match" lookup.
// ─────────────────────────────────────────────────────────────────────────────
export const getNetBalances = (members, expenses = [], settlements = []) => {
  const acc = {};

  // Initialise — settled is tracked separately so the UI can display it.
  members.forEach((m) => {
    acc[m.id] = { id: m.id, name: m.name, paid: 0, owes: 0, settled: 0 };
  });

  // Single pass through expenses.
  expenses.forEach((e) => {
    if (acc[e.paidBy]) acc[e.paidBy].paid += Number(e.amount) || 0;

    (e.splits || []).forEach((s) => {
      if (acc[s.memberId]) acc[s.memberId].owes += Number(s.amount) || 0;
    });
  });

  // Single pass through settlements.
  // Each record is counted once regardless of how many partial payments exist
  // between a pair — the algorithm never needs to "recognise" a specific pair.
  settlements.forEach((s) => {
    if (acc[s.fromId]) acc[s.fromId].settled += Number(s.amount) || 0;
    if (acc[s.toId])   acc[s.toId].settled   -= Number(s.amount) || 0;
  });

  return Object.values(acc).map((b) => ({
    ...b,
    // balance > 0  →  others still owe this person
    // balance < 0  →  this person still owes others
    balance: Math.round((b.paid - b.owes + b.settled) * 100) / 100,
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// simplifyDebts
//
// Accepts the output of getNetBalances (which already has settlements baked in)
// and greedily minimises the number of transfers needed to zero all balances.
//
// Key design decision — settlements are handled BEFORE this function runs:
// ──────────────────────────────────────────────────────────────────────────
// The old approach checked `isAlreadySettled` by looking for an exact amount
// match inside the loop.  That breaks for partial payments: if A owes B ₹100
// and pays ₹40 then ₹60, neither partial matches the ₹100 the algorithm
// suggests, so both payments are ignored and the debt appears unsettled.
//
// The fix: getNetBalances already subtracts every settlement from each member's
// balance before we arrive here.  simplifyDebts therefore always operates on
// the *remaining* net debt — partial or full payments are automatically
// reflected.  There is no settlement list to consult inside the loop at all.
// ─────────────────────────────────────────────────────────────────────────────
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
    const creditors = balances.filter((b) => b.balance >  EPSILON);
    const debtors   = balances.filter((b) => b.balance < -EPSILON);

    if (creditors.length === 0 || debtors.length === 0) break;

    // Greedily pair the largest creditor with the largest debtor each round.
    // This minimises the total number of transactions.
    const maxC = creditors.reduce((a, b) => (a.balance > b.balance ? a : b));
    const maxD = debtors.reduce((a, b)   => (a.balance < b.balance ? a : b));

    const amount = Math.min(maxC.balance, -maxD.balance);
    if (amount < EPSILON) break;

    transactions.push({
      fromId: maxD.id,
      toId:   maxC.id,
      from:   maxD.name,
      to:     maxC.name,
      amount: Math.round(amount * 100) / 100,
    });

    // Round after every mutation to prevent 0.000000x dust accumulation.
    maxC.balance = Math.round((maxC.balance - amount) * 100) / 100;
    maxD.balance = Math.round((maxD.balance + amount) * 100) / 100;
  }

  return transactions;
}
