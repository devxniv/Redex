import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { validateEmailData } from "@/lib/email-validation";

const categoryEmoji = {
  savings: "💰",
  spending: "🛍️",
  income: "📈",
  warning: "⚠️",
  tip: "💡",
};

const categoryLabel = {
  savings: "Savings",
  spending: "Spending",
  income: "Income",
  warning: "Warning",
  tip: "Tip",
};

export default function EmailTemplate({
  userName = "",
  type = "monthly-report",
  data = {},
}) {
  const validationResult = validateEmailData({ type, data, userName });

  if (!validationResult) {
    console.error(
      `Cannot render email: validation failed for type="${type}", userName="${userName}"`,
    );
    return (
      <Html>
        <Head />
        <Body style={styles.body}>
          <Container style={styles.container}>
            <Text style={styles.text}>
              We encountered an issue generating your email. Please contact
              support if this continues.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }

  const validatedData = validationResult.data;
  const stats = validatedData?.stats || {};
  const byCategory = stats.byCategory || {};
  const insights = validatedData?.insights || [];
  const totalIncome = Number(stats.totalIncome) || 0;
  const totalExpenses = Number(stats.totalExpenses) || 0;
  const netSavings = totalIncome - totalExpenses;

  // Normalize insights — handle both plain strings (legacy) and { text, category } objects
  const normalizedInsights = insights.map((insight) =>
    typeof insight === "string" ? { text: insight, category: "tip" } : insight,
  );

  // 1. MONTHLY REPORT TEMPLATE
  if (type === "monthly-report") {
    return (
      <Html>
        <Head />
        <Preview>Your Monthly Financial Report</Preview>
        <Body style={styles.body}>
          <Container style={styles.container}>
            <Heading style={styles.title}>Monthly Financial Report</Heading>

            <Text style={styles.text}>Hello {userName},</Text>
            <Text style={styles.text}>
              Here&rsquo;s your financial summary for{" "}
              {data?.month || "this month"}:
            </Text>

            <Section style={styles.statsContainer}>
              <div style={styles.stat}>
                <Text style={styles.statLabel}>Total Income</Text>
                <Text style={{ ...styles.statValue, color: "#22c55e" }}>
                  ₹{totalIncome.toFixed(2)}
                </Text>
              </div>
              <div style={styles.stat}>
                <Text style={styles.statLabel}>Total Expenses</Text>
                <Text style={{ ...styles.statValue, color: "#ef4444" }}>
                  ₹{totalExpenses.toFixed(2)}
                </Text>
              </div>
              <div style={styles.stat}>
                <Text style={styles.statLabel}>Net Savings</Text>
                <Text
                  style={{
                    ...styles.statValue,
                    color: netSavings >= 0 ? "#22c55e" : "#ef4444",
                  }}
                >
                  ₹{netSavings.toFixed(2)}
                </Text>
              </div>
            </Section>

            {Object.keys(byCategory).length > 0 && (
              <Section style={styles.section}>
                <Heading style={styles.heading}>Expenses by Category</Heading>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {Object.entries(byCategory).map(([category, amount]) => (
                      <tr
                        key={category}
                        style={{ borderBottom: "1px solid #e5e7eb" }}
                      >
                        <td style={{ padding: "12px 0", textAlign: "left" }}>
                          <span style={{ color: "#4b5563" }}>{category}</span>
                        </td>
                        <td style={{ padding: "12px 0", textAlign: "right" }}>
                          <span style={{ fontWeight: "600", color: "#1f2937" }}>
                            ₹{Number(amount).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {normalizedInsights.length > 0 && (
              <Section style={styles.section}>
                <Heading style={styles.heading}>Redex AI Insights</Heading>
                {normalizedInsights.map((insight, index) => (
                  <div key={index} style={styles.insightCard}>
                    <div style={styles.insightHeader}>
                      <span style={styles.insightEmoji}>
                        {categoryEmoji[insight.category] ?? "💡"}
                      </span>
                      <span style={styles.insightCategory}>
                        {categoryLabel[insight.category] ?? "Tip"}
                      </span>
                    </div>
                    <Text style={styles.insightText}>{insight.text}</Text>
                  </div>
                ))}
              </Section>
            )}

            <Text style={styles.footer}>
              Thank you for using Redex. Keep tracking your finances for better
              financial health!
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }

  // 2. BUDGET ALERT TEMPLATE
  if (type === "budget-alert") {
    const budgetAmount = Number(data?.budgetAmount) || 0;
    const spentAmount = Number(data?.totalExpenses) || 0;
    const remaining = budgetAmount - spentAmount;

    return (
      <Html>
        <Head />
        <Preview>Budget Alert: Threshold Reached</Preview>
        <Body style={styles.body}>
          <Container style={styles.container}>
            <Heading style={styles.title}>Budget Alert</Heading>
            <Text style={styles.text}>Hello {userName},</Text>
            <Text style={styles.text}>
              You&rsquo;ve used{" "}
              <strong>{data?.percentageUsed?.toFixed(1) || 0}%</strong> of your
              monthly budget for {data?.accountName || "your account"}.
            </Text>

            <Section style={styles.statsContainer}>
              <div style={styles.stat}>
                <Text style={styles.statLabel}>Budget Amount</Text>
                <Text style={styles.statValue}>₹{budgetAmount.toFixed(2)}</Text>
              </div>
              <div style={styles.stat}>
                <Text style={styles.statLabel}>Spent So Far</Text>
                <Text style={{ ...styles.statValue, color: "#ef4444" }}>
                  ₹{spentAmount.toFixed(2)}
                </Text>
              </div>
              <div style={styles.stat}>
                <Text style={styles.statLabel}>Remaining</Text>
                <Text
                  style={{
                    ...styles.statValue,
                    color: remaining >= 0 ? "#22c55e" : "#ef4444",
                  }}
                >
                  ₹{remaining.toFixed(2)}
                </Text>
              </div>
            </Section>

            <Text style={styles.footer}>
              Log in to Redex to review your recent transactions and adjust your
              spending.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }

  return null;
}

const styles = {
  body: {
    backgroundColor: "#f6f9fc",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "20px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    padding: "40px 20px",
    borderRadius: "8px",
    maxWidth: "600px",
    border: "1px solid #e5e7eb",
  },
  title: {
    color: "#111827",
    fontSize: "26px",
    fontWeight: "bold",
    textAlign: "center",
    margin: "0 0 30px",
  },
  heading: {
    color: "#1f2937",
    fontSize: "18px",
    fontWeight: "600",
    margin: "0 0 12px",
  },
  text: {
    color: "#374151",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  statLabel: {
    margin: "0",
    fontSize: "12px",
    color: "#6b7280",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  statValue: {
    margin: "4px 0 0",
    fontSize: "20px",
    fontWeight: "bold",
    color: "#1f2937",
  },
  statsContainer: {
    margin: "24px 0",
    padding: "20px",
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #f3f4f6",
  },
  stat: {
    marginBottom: "16px",
  },
  section: {
    marginTop: "24px",
    paddingTop: "24px",
    borderTop: "1px solid #f3f4f6",
  },
  // ✅ New insight card styles
  insightCard: {
    backgroundColor: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "10px",
  },
  insightHeader: {
    display: "flex",
    alignItems: "center",
    marginBottom: "4px",
    gap: "6px",
  },
  insightEmoji: {
    fontSize: "16px",
  },
  insightCategory: {
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#6b7280",
    letterSpacing: "0.05em",
  },
  insightText: {
    color: "#4b5563",
    fontSize: "15px",
    lineHeight: "22px",
    margin: "0",
  },
  footer: {
    color: "#9ca3af",
    fontSize: "13px",
    textAlign: "center",
    marginTop: "40px",
    paddingTop: "20px",
    borderTop: "1px solid #f3f4f6",
    lineHeight: "20px",
  },
};
