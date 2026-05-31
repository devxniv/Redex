import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { Suspense } from "react";
import { getOrCreateGroup } from "@/actions/splitter.budget";
import BudgetSplitter from "@/components/budget-splitter";

// FIX #10: Extract data fetching into a separate component for Suspense boundary
async function BudgetSplitterContent() {
  let initialGroup;

  try {
    // Single point of entry: auth check happens inside this action
    initialGroup = await getOrCreateGroup();
  } catch (error) {
    // FIX #1: Rethrow redirect errors so Next.js can handle them properly
    if (isRedirectError(error)) throw error;

    // FIX #4: Exact match on Unauthorized to avoid false positives
    // (e.g., database permission errors that mention "Unauthorized")
    if (error?.message === "Unauthorized") {
      redirect("/sign-in");
    }

    console.error("Failed to load budget group:", error);
    return (
      <div
        className="container mx-auto px-4 py-8 mt-20"
        style={{ textAlign: "center" }}
      >
        <h2 className="text-2xl font-bold text-red-500 mb-2">
          Something went wrong
        </h2>
        <p className="text-gray-600">
          Failed to load your budget group. Please try again later.
        </p>
      </div>
    );
  }

  // FIX #3: Serialization handles Prisma Decimal/Date types for the Client Component
  // Note: undefined fields will be silently dropped — ensure all required fields are non-null
  const serializedGroup = JSON.parse(JSON.stringify(initialGroup));

  return <BudgetSplitter initialGroup={serializedGroup} />;
}

function BudgetSplitterSkeleton() {
  return (
    <>
      <style>{`
        @keyframes pulse-animation {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <div
        style={{
          textAlign: "center",
          padding: "60px 20px",
          color: "#6b7280",
        }}
      >
        <div
          style={{
            animation:
              "pulse-animation 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          <div
            style={{
              height: "40px",
              background: "#2a2d3e",
              borderRadius: "8px",
              marginBottom: "20px",
            }}
          />
          <div
            style={{
              height: "20px",
              background: "#2a2d3e",
              borderRadius: "8px",
              width: "60%",
              margin: "0 auto",
            }}
          />
        </div>
      </div>
    </>
  );
}

export default async function BudgetSplitterPage() {
  return (
    <div className="container mx-auto px-4 py-8 mt-20">
      <div className="flex flex-col items-center gap-4 mb-8">
        <h1 className="text-4xl font-bold gradient-title">Budget Splitter</h1>
        <p className="text-gray-600">
          Simplify group expenses using our advanced debt-reduction algorithm.
        </p>
      </div>
      <div className="flex justify-center">
        <div className="w-full max-w-2xl">
          <Suspense fallback={<BudgetSplitterSkeleton />}>
            <BudgetSplitterContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
