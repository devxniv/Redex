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

/**
 * Email Template Component
 * Renders financial report and alert emails with built-in data validation
 *
 * @param {Object} props
 * @param {string} props.userName - User's name
 * @param {string} props.type - Email type (monthly-report, budget-alert)
 * @param {Object} props.data - Email-specific data
 * @returns {JSX.Element|null} - Rendered email or error fallback
 */
export default function EmailTemplate({
  userName = "",
  type = "monthly-report",
  data = {},
}) {
  // Validate data before rendering to prevent partial/broken emails
  const validationResult = validateEmailData({ type, data, userName });

  // Return error fallback if validation fails
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

  // Use validated data
  const validatedData = validationResult.data;
  const stats = validatedData?.stats || {};
  const byCategory = stats.byCategory || {};
  const insights = validatedData?.insights || [];
  const totalIncome = Number(stats.totalIncome) || 0;
  const totalExpenses = Number(stats.totalExpenses) || 0;
  const netSavings = totalIncome - totalExpenses;

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
                <Text style={styles.statValue}>₹{totalIncome.toFixed(2)}</Text>
              </div>
              <div style={styles.stat}>
                <Text style={styles.statLabel}>Total Expenses</Text>
                <Text style={styles.statValue}>
                  ₹{totalExpenses.toFixed(2)}
                </Text>
              </div>
              <div style={styles.stat}>
                <Text style={styles.statLabel}>Net Savings</Text>
                <Text style={styles.statValue}>₹{netSavings.toFixed(2)}</Text>
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

            {insights.length > 0 && (
              <Section style={styles.section}>
                <Heading style={styles.heading}>Redex AI Insights</Heading>
                {insights.map((insight, index) => (
                  <Text key={index} style={styles.insightText}>
                    • {insight}
                  </Text>
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
                <Text style={styles.statValue}>₹{remaining.toFixed(2)}</Text>
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

  return null; // Fallback if type doesn't match
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
  insightText: {
    color: "#4b5563",
    fontSize: "15px",
    lineHeight: "22px",
    marginBottom: "10px",
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
