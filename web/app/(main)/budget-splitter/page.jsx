import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrCreateGroup } from "@/actions/splitter.budget";
import BudgetSplitter from "@/components/budget-splitter";

export default async function BudgetSplitterPage() {
  // ✅ Next.js 15 Fix: Destructure directly from the awaited auth() call.
  // This ensures that internal headers/cookies are handled asynchronously.
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  let initialGroup;
  try {
    // Ensure this action also awaits auth() internally if it checks for userId
    initialGroup = await getOrCreateGroup();
  } catch (error) {
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

  // Serialization handles Prisma Decimal/Date types for the Client Component
  const serializedGroup = JSON.parse(JSON.stringify(initialGroup));

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
          <BudgetSplitter initialGroup={serializedGroup} />
        </div>
      </div>
    </div>
  );
}
