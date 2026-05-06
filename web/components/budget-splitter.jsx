"use client";
import {
  useState,
  useCallback,
  useTransition,
  useMemo,
  useEffect,
  useRef,
} from "react";

// database actions
import {
  addMember as addMemberAction,
  updateMember as updateMemberAction,
  removeMember as removeMemberAction,
  addExpense as addExpenseAction,
  removeExpense as removeExpenseAction,
  markSettlementAsPaid,
  removeSettlement as removeSettlementAction,
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

// FIX #5: Always parse from ISO date string (createdAt) so new Date() is valid.
// The old code stored a pre-formatted "05 May" string in local state which
// new Date() cannot parse, resulting in an Invalid Date and a blank display.
const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

// StatBox outside component — avoids re-creation on every render
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
  const memberTimeouts = useRef({});
  const transitionWatchdog = useRef(null);

  const safeTransition = useCallback(
    (fn) => {
      clearTimeout(transitionWatchdog.current);
      transitionWatchdog.current = setTimeout(() => {
        console.error(
          "[BudgetSplitter] startTransition exceeded 15 s. " +
            "Possible hung server action (Next.js 15 sync-dynamic-apis?). Reloading.",
        );
        window.location.reload();
      }, 15_000);

      startTransition(async () => {
        try {
          await fn();
        } finally {
          clearTimeout(transitionWatchdog.current);
        }
      });
    },
    [startTransition],
  );

  // Members that have a name AND are fully persisted to the DB.
  const validMembers = useMemo(
    () => members.filter((m) => m.name?.trim() && !m._isTemp),
    [members],
  );

  // ── Calculations ──
  const netBalances = getNetBalances(validMembers, expenses, settlementsData);

  const suggestedSettlements = simplifyDebts(
    netBalances.map((b) => ({ id: b.id, name: b.name, balance: b.balance })),
  );

  const totalSpend = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const customTotal = Object.values(form.customSplits).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );
  const customDiff = Number(form.amount) - customTotal;
  const isSplitInvalid =
    form.splitMode === "custom" && Math.abs(customDiff) > 0.01;

  // Cleanup debounce timers and watchdog on unmount
  useEffect(() => {
    const timeouts = memberTimeouts.current;
    const watchdog = transitionWatchdog.current;
    return () => {
      Object.values(timeouts).forEach(clearTimeout);
      clearTimeout(watchdog);
    };
  }, []);

  // Auto-set paidBy to first valid member
  useEffect(() => {
    if (validMembers.length > 0 && !form.paidBy) {
      setForm((prev) => ({ ...prev, paidBy: validMembers[0].id }));
    }
  }, [validMembers, form.paidBy]);

  // ── Member Handlers ──
  const handleAddMember = () => {
    const tempId = crypto.randomUUID();
    setMembers((m) => [...m, { id: tempId, name: "", _isTemp: true }]);
  };

  const handleUpdateMember = (id, name) => {
    if (!id) return;

    // 1. Immediately reflect the keystroke in the UI.
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, name } : x)));

    clearTimeout(memberTimeouts.current[id]);

    memberTimeouts.current[id] = setTimeout(async () => {
      // 2. Read the current member from live state (avoids stale closure).
      let memberToSave = null;
      setMembers((current) => {
        memberToSave = current.find((m) => m.id === id);
        return current;
      });

      // FIX #7: Use memberToSave.name (live state) instead of the closed-over
      // `name` variable, which may be stale if the user typed then deleted quickly.
      if (!memberToSave || !memberToSave.name.trim()) return;

      try {
        if (memberToSave._isTemp) {
          const realMember = await addMemberAction(groupId, memberToSave.name.trim());
          setMembers((current) =>
            current.map((x) =>
              x.id === id ? { ...x, id: realMember.id, _isTemp: false } : x,
            ),
          );
          delete memberTimeouts.current[id];
        } else {
          await updateMemberAction(id, memberToSave.name.trim());
        }
      } catch (error) {
        console.error("Failed to save member:", error);
      }
    }, 800);
  };

  const handleRemoveMember = async (id) => {
    const member = members.find((m) => m.id === id);

    if (member?._isTemp) {
      clearTimeout(memberTimeouts.current[id]);
      delete memberTimeouts.current[id];
      setMembers((m) => m.filter((x) => x.id !== id));
      return;
    }

    if (
      !confirm(
        "Remove this member? All their splits and settlements will be deleted.",
      )
    )
      return;

    setMembers((m) => m.filter((x) => x.id !== id));

    // FIX #3: Also remove expenses paid by this member AND strip this member
    // from splits of remaining expenses so getNetBalances stays accurate.
    setExpenses((prev) =>
      prev
        .filter((e) => e.paidBy !== id)
        .map((e) => ({
          ...e,
          splits: (e.splits || []).filter((s) => s.memberId !== id),
        })),
    );

    // FIX #10: Remove stale settlement records involving this member from
    // local state so getNetBalances is not polluted.
    setSettlementsData((prev) =>
      prev.filter((s) => s.fromId !== id && s.toId !== id),
    );

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

    const payer = validMembers.find((m) => m.id === form.paidBy);
    if (!payer) {
      alert(
        "Selected payer is not yet saved. Please wait a moment and try again.",
      );
      return;
    }

    const splits = computeSplits();

    const allSplitMembersExist = splits.every((s) =>
      validMembers.some((m) => m.id === s.memberId),
    );
    if (!allSplitMembersExist) {
      alert(
        "Some members are not yet saved. Please wait a moment and try again.",
      );
      return;
    }

    const tempId = crypto.randomUUID();
    // FIX #5: Store ISO string in local state so formatDate can parse it
    // correctly. The old code stored a pre-formatted "05 May" string which
    // new Date() cannot parse, producing Invalid Date and a blank display.
    const nowISO = new Date().toISOString();
    const newExpense = {
      id: tempId,
      desc: form.desc.trim(),
      amount: Number(form.amount),
      paidBy: form.paidBy,
      category: form.category,
      splits,
      createdAt: nowISO,
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

    safeTransition(async () => {
      const realExpense = await addExpenseAction(groupId, {
        ...newExpense,
        date: nowISO,
      });
      if (realExpense?.id) {
        setExpenses((prev) =>
          prev.map((e) => (e.id === tempId ? { ...e, id: realExpense.id } : e)),
        );
      }
    });
  };

  const handleRemoveExpense = (id) => {
    setExpenses((e) => e.filter((x) => x.id !== id));
    safeTransition(() => removeExpenseAction(id));
  };

  const updateCustomSplit = (memberId, value) => {
    setForm((prev) => ({
      ...prev,
      customSplits: { ...prev.customSplits, [memberId]: value },
    }));
  };

  // ── Settlement Handlers ──
  const handleMarkAsPaid = (settlement) => {
    setSettlementsData((prev) => [
      ...prev.filter(
        (s) => !(s.fromId === settlement.fromId && s.toId === settlement.toId),
      ),
      {
        fromId: settlement.fromId,
        toId: settlement.toId,
        amount: settlement.amount,
        groupId,
        settledAt: new Date().toISOString(),
      },
    ]);
    markSettlementAsPaid(
      groupId,
      settlement.fromId,
      settlement.toId,
      settlement.amount,
    ).catch((err) => {
      console.error("Failed to mark settlement as paid:", err);
      setSettlementsData((prev) =>
        prev.filter(
          (s) =>
            !(s.fromId === settlement.fromId && s.toId === settlement.toId),
        ),
      );
    });
  };

  const handleUndoPaid = (settlement) => {
    setSettlementsData((prev) =>
      prev.filter(
        (s) => !(s.fromId === settlement.fromId && s.toId === settlement.toId),
      ),
    );
    removeSettlementAction(groupId, settlement.fromId, settlement.toId).catch(
      (err) => {
        console.error("Failed to undo settlement:", err);
        setSettlementsData((prev) => [
          ...prev,
          {
            fromId: settlement.fromId,
            toId: settlement.toId,
            amount: settlement.amount,
            groupId,
          },
        ]);
      },
    );
  };

  // ── Render ──
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
        .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        @keyframes bs-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        .member-saving { animation: bs-pulse 1.4s ease-in-out infinite; border-color: #2a2d3e !important; }
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
        {/* FIX #9: Count only unsettled suggestions for the "To Settle" stat */}
        <StatBox
          label="To Settle"
          value={suggestedSettlements.length}
          color="#FCA5A5"
        />
      </div>

      <div className="bs-card">
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #1e2130",
            overflowX: "auto",
          }}
        >
          {["expenses", "members", "balances", "settle"].map((t) => (
            <button
              key={t}
              className={`bs-tab${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
              style={{ textTransform: "capitalize", whiteSpace: "nowrap" }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {/* ══ EXPENSES TAB ══ */}
          {tab === "expenses" && (
            <>
              {showForm ? (
                <div
                  style={{
                    background: "#1a1d2e",
                    borderRadius: 14,
                    padding: 18,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ marginBottom: 12 }}>
                    <input
                      className="bs-input"
                      placeholder="What was this for?"
                      value={form.desc}
                      onChange={(e) =>
                        setForm({ ...form, desc: e.target.value })
                      }
                      style={{ marginBottom: 10 }}
                    />
                    <input
                      className="bs-input"
                      type="number"
                      placeholder="Amount (₹)"
                      value={form.amount}
                      onChange={(e) =>
                        setForm({ ...form, amount: e.target.value })
                      }
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginBottom: 15,
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

                  <div style={{ marginBottom: 15, display: "flex", gap: 15 }}>
                    {["equal", "custom"].map((mode) => (
                      <label
                        key={mode}
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
                          checked={form.splitMode === mode}
                          onChange={() => setForm({ ...form, splitMode: mode })}
                        />
                        {mode === "equal" ? "Split Equally" : "Custom Split"}
                      </label>
                    ))}
                  </div>

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
                        !form.paidBy ||
                        isSplitInvalid ||
                        isPending
                      }
                    >
                      {isSplitInvalid ? "Fix Total" : "Add Expense"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {isPending && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        textAlign: "center",
                        marginBottom: 8,
                      }}
                    >
                      Saving... please wait
                    </div>
                  )}
                  <button
                    className="bs-btn bs-btn-primary"
                    style={{ width: "100%", marginBottom: 16 }}
                    onClick={() => setShowForm(true)}
                    disabled={isPending}
                  >
                    + Add Expense
                  </button>
                </>
              )}

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
                        {/* FIX #8: Use createdAt exclusively — it is always
                            an ISO string from both server data and local state */}
                        {formatDate(exp.createdAt)} • Paid by{" "}
                        {validMembers.find((m) => m.id === exp.paidBy)?.name ||
                          "Unknown"}
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
                        fontSize: "18px",
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

          {/* ══ MEMBERS TAB ══ */}
          {tab === "members" && (
            <div>
              {members.map((m, i) => (
                <div
                  key={m.id}
                  className={m._isTemp ? "member-saving" : ""}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#1a1d2e",
                    padding: 12,
                    borderRadius: 10,
                    marginBottom: 8,
                    border: "1px solid transparent",
                  }}
                >
                  <div
                    className="dot"
                    style={{ background: m._isTemp ? "#4b5563" : memberColor(i) }}
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
                    disabled={m._isTemp}
                    style={{
                      color: m._isTemp ? "#374151" : "#ef4444",
                      background: "none",
                      border: "none",
                      fontSize: "18px",
                      cursor: m._isTemp ? "not-allowed" : "pointer",
                      transition: "color 0.2s",
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

          {/* ══ BALANCES TAB ══ */}
          {tab === "balances" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {netBalances.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 0",
                    color: "#4b5563",
                  }}
                >
                  Add members and expenses to see balances.
                </div>
              ) : (
                netBalances.map((b, i) => (
                  <div
                    key={b.id}
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
                          {b.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontWeight: 700,
                          color: b.balance >= 0 ? "#6EE7B7" : "#FCA5A5",
                        }}
                      >
                        {b.balance >= 0 ? "+" : ""}₹
                        {Math.abs(b.balance).toFixed(2)}
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
                      <span>Paid: ₹{b.paid.toFixed(2)}</span>
                      <span>Owes: ₹{b.owes.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ══ SETTLE TAB ══ */}
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
                  // FIX #4: Remove the brittle amount check that broke for
                  // partial payments. simplifyDebts already operates on the
                  // remaining balance (settlements baked in by getNetBalances),
                  // so any entry in settlementsData for this pair means the
                  // full suggested amount has been covered.
                  const isSettled = settlementsData.some(
                    (sd) =>
                      sd.fromId === s.fromId && sd.toId === s.toId,
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
                          ₹{s.amount.toFixed(2)}
                        </span>
                        <span style={{ color: "#6b7280" }}>to</span>
                        <span style={{ color: "#fff", fontWeight: 600 }}>
                          {s.to}
                        </span>
                      </div>
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
        </div>
      </div>
    </div>
  );
}
