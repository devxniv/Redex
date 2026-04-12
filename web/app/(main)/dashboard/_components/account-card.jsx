//This code defines a React component that displays a styled account card with income/expense info, balance, and a switch to toggle the default account using async updates and toast notifications.

// Enables React Server Components with client-side interactivity
"use client";

// Importing icons from lucide-react for UI visuals
import { ArrowUpRight, ArrowDownRight, CreditCard } from "lucide-react";

// Importing UI components from a design system
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// React hook for running side effects
import { useEffect } from "react";

// Custom hook to manage async operations and state
import useFetch from "@/hooks/use-fetch";

// Card layout components for consistent UI
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Next.js component for client-side navigation
import Link from "next/link";

// Action function to update the default account in backend
import { updateDefaultAccount } from "@/actions/account";

// Toast notification system for user feedback
import { toast } from "sonner";

// Functional component to render a card for a single account
export function AccountCard({ account }) {
  // Destructure account properties
  const { name, type, balance, id, isDefault } = account;

  // Using the custom useFetch hook with updateDefaultAccount action
  const {
    loading: updateDefaultLoading, // loading state while updating
    fn: updateDefaultFn, // async function to call the action
    data: updatedAccount, // response from the action
    error, // error from the action
  } = useFetch(updateDefaultAccount);

  // Handler when the Switch is clicked
  const handleDefaultChange = async (event) => {
    event.preventDefault(); // Prevent the default link navigation

    // Prevent unsetting the only default account
    if (isDefault) {
      toast.warning("You need atleast 1 default account");
      return;
    }

    // Call the async function to update the default account
    await updateDefaultFn(id);
  };

  // Show success toast when update succeeds
  useEffect(() => {
    if (updatedAccount?.success) {
      toast.success("Default account updated successfully");
    }
  }, [updatedAccount]);

  // Show error toast if update fails
  useEffect(() => {
    if (error) {
      toast.error(error.message || "Failed to update default account");
    }
  }, [error]);

  // Render the account card
  return (
    <Card className="hover:shadow-md transition-shadow group relative">
      {/* Link to account details page */}
      <Link href={`/account/${id}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium capitalize">
            {name}
          </CardTitle>
          {/* Switch to set as default account */}
          <Switch
            checked={isDefault}
            onClick={handleDefaultChange}
            disabled={updateDefaultLoading}
          />
        </CardHeader>

        <CardContent>
          {/* Display account balance */}
          <div className="text-2xl font-bold">
            ₹{parseFloat(balance).toFixed(2)}
          </div>
          {/* Display account type */}
          <p className="text-xs text-muted-foreground">
            {type.charAt(0) + type.slice(1).toLowerCase()} Account
          </p>
        </CardContent>

        <CardFooter className="flex justify-between text-sm text-muted-foreground">
          {/* Income label */}
          <div className="flex items-center">
            <ArrowUpRight className="mr-1 h-4 w-4 text-green-500" />
            Income
          </div>
          {/* Expense label */}
          <div className="flex items-center">
            <ArrowDownRight className="mr-1 h-4 w-4 text-red-500" />
            Expense
          </div>
        </CardFooter>
      </Link>
    </Card>
  );
}
