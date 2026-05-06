"use client";
import { useState, useCallback, useTransition, useMemo } from "react";
//database actions
import {
  addMember as addMemberAction,
  updateMember as updateMemberAction,
  removeMember as removeMemberAction,
  addExpense as addExpenseAction,
  removeExpense as removeExpenseAction,
  markSettlementAsPaid,
} from "@/actions/splitter.budget";
// Logic Utilities
import { getNetBalances, simplifyDebts } from "@/lib/budget-utils";

// ── Helpers ──
const COLORS = [
  "#6EE7B7",
  "#93C5FD",
  "#FCA5A5",
  "#FDE68A",
  "#C4B5FD",
  "#FDA4AF",
  "#67E8F9",
  "#86EFAC",
];

const memberColor = (idx) => COLORS[idx % COLORS.length];

const CATEGORIES = [
  "🍕 Food",
  "🚗 Transport",
  "🏠 Accommodation",
  "🎉 Entertainment",
  "🛒 Groceries",
  "💊 Healthcare",
  "🎫 Activity",
  "📦 Other",
];

const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

export default function BudgetSplitter({ initialGroup }) {
  const [tab, setTab] = useState("members");
  const [members, setMembers] = useState(initialGroup.members || []);
  const [expenses, setExpenses] = useState(initialGroup.expenses || []);
  const [settlementsData, setSettlementsData] = useState(
    initialGroup.settlements || [],
  );

  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    desc: "",
    amount: "",
    paidBy: "",
    category: CATEGORIES[0],
    splitMode: "equal",
    customSplits: {},
  });

  const groupId = initialGroup.id;
  const validMembers = useMemo(
    () => members.filter((m) => m.name?.trim()),
    [members],
  );

  // Calculations
  // Change 'group' to 'initialGroup' or use your local state for real-time updates
  const netBalances = getNetBalances(validMembers, expenses, settlementsData);

  const suggestedSettlements = simplifyDebts(
    netBalances.map((b) => ({ id: b.id, name: b.name, balance: b.balance })),
    settlementsData, // ✅ pass DB settlements so "Mark paid" survives page refresh
  );

  const totalSpend = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const customTotal = Object.values(form.customSplits).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );
  const customDiff = Number(form.amount) - customTotal;
  const isSplitInvalid =
    form.splitMode === "custom" && Math.abs(customDiff) > 0.01;

  // ── Member Handlers (Improved with error handling) ──
  const handleAddMember = async () => {
    const tempId = crypto.randomUUID();
    setMembers((m) => [...m, { id: tempId, name: "" }]);

    startTransition(async () => {
      const realMember = await addMemberAction(groupId, "");
      setMembers((m) =>
        m.map((x) => (x.id === tempId ? { ...x, id: realMember.id } : x)),
      );
    });
  };

  const handleUpdateMember = (id, name) => {
    if (!id) return;

    // Optimistic update
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, name } : x)));

    // Debounced server sync

    window[`__memberTimeout_${id}`] = setTimeout(async () => {
      try {
        await updateMemberAction(id, name);
      } catch (error) {
        // Only log real errors, ignore "member not found" which is now silent on server
        if (!error.message?.includes("no longer exists")) {
          console.error("Failed to update member:", error);
        }
      }
    }, 800);
    clearTimeout(window[`__memberTimeout_${id}`]);
  };

  const handleRemoveMember = async (id) => {
    if (
      !confirm(
        "Remove this member? All their splits and settlements will be deleted.",
      )
    )
      return;

    // Optimistically remove member AND their expenses from local state
    setMembers((m) => m.filter((x) => x.id !== id));
    setExpenses((e) => e.filter((x) => x.paidBy !== id));

    try {
      await removeMemberAction(id);
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert("Failed to remove member. Please refresh the page.");
    }
  };

  // ── Expense Handlers ──
  const computeSplits = useCallback(() => {
    const amt = Number(form.amount) || 0;
    if (form.splitMode === "equal") {
      const share = amt / (validMembers.length || 1);
      return validMembers.map((m) => ({
        memberId: m.id,
        amount: Math.round(share * 100) / 100,
      }));
    }
    return validMembers.map((m) => ({
      memberId: m.id,
      amount: Math.round((Number(form.customSplits[m.id]) || 0) * 100) / 100,
    }));
  }, [form, validMembers]);

  const handleAddExpense = () => {
    if (!form.desc?.trim() || !form.amount || !form.paidBy || isSplitInvalid)
      return;

    const splits = computeSplits();
    const newExpense = {
      id: crypto.randomUUID(),
      desc: form.desc.trim(),
      amount: Number(form.amount),
      paidBy: form.paidBy,
      category: form.category,
      splits,
      date: new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      }),
    };

    setExpenses((e) => [...e, newExpense]);
    setShowForm(false);

    setForm({
      desc: "",
      amount: "",
      paidBy: validMembers[0]?.id || "",
      category: CATEGORIES[0],
      splitMode: "equal",
      customSplits: {},
    });

    startTransition(() =>
      addExpenseAction(groupId, {
        ...newExpense,
        date: new Date().toISOString(), // server needs ISO date, not "04 May"
      }),
    );

    const handleRemoveExpense = (id) => {
      setExpenses((e) => e.filter((x) => x.id !== id));
      startTransition(() => removeExpenseAction(id));
    };

    const updateCustomSplit = (memberId, value) => {
      setForm((prev) => ({
        ...prev,
        customSplits: { ...prev.customSplits, [memberId]: value },
      }));
    };

    // Mark as Paid
    // ── settlement handlers ──
    const handleMarkAsPaid = (settlement) => {
      // Optimistically add to settlementsData so balances update immediately
      setSettlementsData((prev) => [
        ...prev.filter(
          (s) =>
            !(s.fromId === settlement.fromId && s.toId === settlement.toId),
        ),
        {
          fromId: settlement.fromId,
          toId: settlement.toId,
          amount: settlement.amount,
          groupId,
          settledAt: new Date().toISOString(),
        },
      ]);

      startTransition(async () => {
        await markSettlementAsPaid(
          groupId,
          settlement.fromId,
          settlement.toId,
          settlement.amount,
        );
      });
    };

    const handleUndoPaid = (settlement) => {
      // Remove from settlementsData so balances revert immediately
      setSettlementsData((prev) =>
        prev.filter(
          (s) =>
            !(s.fromId === settlement.fromId && s.toId === settlement.toId),
        ),
      );
      // No DB call needed for undo in this implementation
    };

    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", width: "100%" }}>
        <style>{`
        .bs-card { background: #0f1117; border: 1px solid #1e2130; border-radius: 16px; overflow: hidden; }
        .bs-tab { padding: 12px 20px; background: none; border: none; cursor: pointer; font-size: 14px; color: #6b7280; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .bs-tab.active { color: #fff; border-bottom-color: #6EE7B7; }
        .bs-input { background: #1a1d2e; border: 1px solid #2a2d3e; border-radius: 10px; padding: 10px; color: #fff; width: 100%; box-sizing: border-box; }
        .bs-btn { border: none; border-radius: 10px; padding: 10px 18px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .bs-btn-primary { background: #6EE7B7; color: #0a0d14; }
        .bs-btn-ghost { background: #1a1d2e; color: #9ca3af; border: 1px solid #2a2d3e; }
        .expense-row { background: #1a1d2e; border: 1px solid #2a2d3e; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; }
      `}</style>

        {/* Stats Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatBox
            label="Total Spent"
            value={`₹${totalSpend.toLocaleString("en-IN")}`}
            color="#6EE7B7"
          />
          <StatBox label="Expenses" value={expenses.length} color="#93C5FD" />
          <StatBox
            label="To Settle"
            value={suggestedSettlements.length}
            color="#FCA5A5"
          />
        </div>

        <div
          className="bs-card"
          style={{
            transition: "opacity 0.2s",
          }}
        >
          <div style={{ display: "flex", borderBottom: "1px solid #1e2130" }}>
            {["members", "expenses", "balances", "settle"].map((t) => (
              <button
                key={t}
                className={`bs-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ padding: 20 }}>
            {/* Expenses Tab */}
            {tab === "expenses" && (
              <>
                {showForm ? (
                  <div
                    style={{
                      background: "#131625",
                      padding: 16,
                      borderRadius: 12,
                      marginBottom: 16,
                      border: "1px solid #2a2d3e",
                    }}
                  >
                    {/* Basic Info: Description & Amount */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <input
                        className="bs-input"
                        placeholder="What was this for?"
                        value={form.desc}
                        onChange={(e) =>
                          setForm({ ...form, desc: e.target.value })
                        }
                      />
                      <input
                        className="bs-input"
                        type="number"
                        step="0.01"
                        placeholder="Amount (₹)"
                        value={form.amount}
                        onChange={(e) =>
                          setForm({ ...form, amount: e.target.value })
                        }
                        style={{
                          borderColor: isSplitInvalid ? "#FCA5A5" : "#2a2d3e",
                        }}
                      />
                    </div>

                    {/* Selection: Paid By & Category */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <select
                        className="bs-input"
                        value={form.paidBy}
                        onChange={(e) =>
                          setForm({ ...form, paidBy: e.target.value })
                        }
                      >
                        <option value="" disabled>
                          Who paid?
                        </option>
                        {validMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="bs-input"
                        value={form.category}
                        onChange={(e) =>
                          setForm({ ...form, category: e.target.value })
                        }
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Split Mode Toggle */}
                    <div style={{ marginBottom: 15, display: "flex", gap: 15 }}>
                      <label
                        style={{
                          color: "#fff",
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="splitMode"
                          checked={form.splitMode === "equal"}
                          onChange={() =>
                            setForm({ ...form, splitMode: "equal" })
                          }
                        />{" "}
                        Split Equally
                      </label>
                      <label
                        style={{
                          color: "#fff",
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="splitMode"
                          checked={form.splitMode === "custom"}
                          onChange={() =>
                            setForm({ ...form, splitMode: "custom" })
                          }
                        />{" "}
                        Custom Split
                      </label>
                    </div>

                    {/* Custom Split Inputs */}
                    {form.splitMode === "custom" && (
                      <div
                        style={{
                          background: "#1a1d2e",
                          padding: 12,
                          borderRadius: 10,
                          marginBottom: 15,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: "#9ca3af",
                            marginBottom: 10,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>Individual Shares</span>
                          <span
                            style={{
                              color:
                                Math.abs(customDiff) < 0.01
                                  ? "#6EE7B7"
                                  : "#FCA5A5",
                            }}
                          >
                            Remaining: ₹{customDiff.toFixed(2)}
                          </span>
                        </div>
                        {validMembers.map((m) => (
                          <div
                            key={m.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              marginBottom: 8,
                            }}
                          >
                            <span
                              style={{ flex: 1, fontSize: 14, color: "#fff" }}
                            >
                              {m.name}
                            </span>
                            <input
                              className="bs-input"
                              style={{ width: "100px", padding: "6px 10px" }}
                              type="number"
                              placeholder="0.00"
                              value={form.customSplits[m.id] || ""}
                              onChange={(e) =>
                                updateCustomSplit(m.id, e.target.value)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Form Actions */}
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        className="bs-btn bs-btn-ghost"
                        onClick={() => setShowForm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="bs-btn bs-btn-primary"
                        onClick={handleAddExpense}
                        disabled={
                          !form.desc?.trim() ||
                          Number(form.amount) <= 0 ||
                          !form.amount ||
                          !form.paidBy ||
                          isSplitInvalid
                        }
                      >
                        {isSplitInvalid ? "Fix Total" : "Add Expense"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="bs-btn bs-btn-primary"
                    style={{ width: "100%", marginBottom: 16 }}
                    onClick={() => setShowForm(true)}
                  >
                    + Add Expense
                  </button>
                )}

                {/* Expense List */}
                {expenses.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "40px 0",
                      color: "#4b5563",
                    }}
                  >
                    No expenses yet. Start by adding one!
                  </div>
                ) : (
                  expenses.map((exp) => (
                    <div key={exp.id} className="expense-row">
                      <span style={{ fontSize: 22 }}>
                        {exp.category?.split(" ")[0] || "📦"}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 600 }}>
                          {exp.desc}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {formatDate(exp.date || exp.createdAt)} • Paid by{" "}
                          {validMembers.find((m) => m.id === exp.paidBy)
                            ?.name || "Unknown"}
                        </div>
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "#6EE7B7",
                          textAlign: "right",
                        }}
                      >
                        <div>₹{Number(exp.amount).toFixed(2)}</div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#4b5563",
                            fontWeight: 400,
                          }}
                        >
                          {exp.splits?.length} ways
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveExpense(exp.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#4b5563",
                          cursor: "pointer",
                          padding: "5px 10px",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </>
            )}

            {/* Members Tab */}
            {tab === "members" && (
              <div>
                {members.map((m, i) => (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "#1a1d2e",
                      padding: 12,
                      borderRadius: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      className="dot"
                      style={{ background: memberColor(i) }}
                    />
                    <input
                      className="bs-input"
                      style={{ border: "none", background: "none", flex: 1 }}
                      placeholder="Name..."
                      value={m.name}
                      onChange={(e) => handleUpdateMember(m.id, e.target.value)}
                    />
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      style={{
                        color: "#ef4444",
                        background: "none",
                        border: "none",
                        fontSize: "18px",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  className="bs-btn bs-btn-ghost"
                  style={{ width: "100%" }}
                  onClick={handleAddMember}
                >
                  + Add Person
                </button>
              </div>
            )}

            {/* Balances & Settle Tabs - use from previous response */}
            {tab === "balances" && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {/* We map over 'members' (an Array) instead of 'netBalances' (an Object) */}
                {members.map((member, i) => {
                  // 1. Look up the specific balance from the netBalances object
                  const balance = netBalances[member.id] || 0;

                  // 2. Calculate the original Paid/Owes stats for the sub-labels
                  const totalPaid = expenses
                    .filter((e) => e.paidBy === member.id)
                    .reduce((sum, e) => sum + e.amount, 0);

                  const totalOwed = expenses.reduce((sum, e) => {
                    const split = e.split?.find(
                      (s) => s.memberId === member.id,
                    );
                    return sum + (split ? split.amount : 0);
                  }, 0);

                  return (
                    <div
                      key={member.id}
                      style={{
                        background: "#1a1d2e",
                        padding: 16,
                        borderRadius: 12,
                        border: "1px solid #2a2d3e",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            className="dot"
                            style={{ background: memberColor(i) }}
                          />
                          <span style={{ color: "#fff", fontWeight: 600 }}>
                            {member.name}
                          </span>
                        </div>
                        {/* Display the calculated balance (adjusted by settlements) */}
                        <span
                          style={{
                            fontWeight: 700,
                            color: balance >= 0 ? "#6EE7B7" : "#FCA5A5",
                          }}
                        >
                          {balance >= 0 ? "+" : ""}₹
                          {Math.abs(balance).toFixed(2)}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "13px",
                          color: "#9ca3af",
                        }}
                      >
                        <span>Paid: ₹{totalPaid.toFixed(2)}</span>
                        <span>Owes: ₹{totalOwed.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* settle Tab */}
            {tab === "settle" && (
              <div>
                {suggestedSettlements.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "60px 20px",
                      color: "#6b7280",
                      background: "#1a1d2e",
                      borderRadius: 12,
                    }}
                  >
                    All settled! 🎉 No payments pending.
                  </div>
                ) : (
                  suggestedSettlements.map((s) => {
                    // ✅ Calculate isSettled once per row, use in both style and label
                    const isSettled = settlementsData.some(
                      (sd) => sd.fromId === s.fromId && sd.toId === s.toId,
                    );

                    return (
                      <div
                        key={`${s.fromId}-${s.toId}`}
                        style={{
                          background: "#1a1d2e",
                          padding: 16,
                          borderRadius: 12,
                          marginBottom: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          // ✅ Visually dim settled rows
                          opacity: isSettled ? 0.5 : 1,
                          transition: "opacity 0.2s",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flex: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ color: "#fff", fontWeight: 600 }}>
                            {s.from}
                          </span>
                          <span style={{ color: "#6b7280" }}>pays</span>
                          <span style={{ color: "#6EE7B7", fontWeight: 700 }}>
                            ₹{s.amount.toFixed(2)}{" "}
                            {/* ✅ consistent decimal formatting */}
                          </span>
                          <span style={{ color: "#6b7280" }}>to</span>
                          <span style={{ color: "#fff", fontWeight: 600 }}>
                            {s.to}
                          </span>
                        </div>

                        {/* ✅ Button reflects settled state — label and style both update */}
                        <button
                          onClick={() =>
                            isSettled ? handleUndoPaid(s) : handleMarkAsPaid(s)
                          }
                          style={{
                            padding: "10px 20px",
                            background: isSettled ? "#1a1d2e" : "#10b981",
                            color: isSettled ? "#9ca3af" : "#fff",
                            border: isSettled ? "1px solid #2a2d3e" : "none",
                            borderRadius: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {isSettled ? "↩ Undo" : "✓ Mark as Paid"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {isPending && (
              <div
                style={{ fontSize: 11, color: "#6b7280", padding: "4px 12px" }}
              >
                Saving...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  function StatBox({ label, value, color }) {
    return (
      <div
        style={{
          background: "#0f1117",
          border: "1px solid #1e2130",
          borderRadius: 14,
          padding: "14px",
          minWidth: "100px",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: color || "#6EE7B7",
            marginBottom: 4,
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
          {label}
        </div>
      </div>
    );
  }
}
