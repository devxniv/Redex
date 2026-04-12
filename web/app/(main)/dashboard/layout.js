// Import the actual Dashboard content component
import DashboardPage from "./page";

// Import a loading spinner component
import { BarLoader } from "react-spinners";

// Import React's Suspense for lazy-loading
import { Suspense } from "react";

// Main Layout component for the Dashboard
export default function Layout() {
  return (
    <div className="px-5">
      {/* Header section with title */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-6xl font-bold tracking-tight gradient-title">
          Dashboard
        </h1>
      </div>

      {/* Suspense is used to handle loading state while DashboardPage is loading */}
      <Suspense
        fallback={
          // While DashboardPage is loading, show a nice loading spinner
          <BarLoader className="mt-4" width={"100%"} color="#9333ea" />
        }
      >
        {/* Actual Dashboard content */}
        <DashboardPage />
      </Suspense>
    </div>
  );
}
