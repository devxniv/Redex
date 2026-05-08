"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Button } from "./ui/button";
import Link from "next/link";
import { LayoutDashboard, PenBox, Users } from "lucide-react";

export const ClerkAuthWrapper = () => {
  return (
    <>
      <Show when="signed-out">
        <SignInButton forceRedirectUrl="/dashboard">
          <Button variant="outline">Login</Button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
          <Button variant="outline">Sign Up</Button>
        </SignUpButton>
      </Show>

      <Show when="signed-in">
        <Link href="/budget-splitter">
          <Button variant="outline" className="flex items-center gap-2">
            <Users size={18} />
            <span className="hidden md:inline">Split Bill</span>
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline" className="flex items-center gap-2">
            <LayoutDashboard size={18} />
            <span className="hidden md:inline">Dashboard</span>
          </Button>
        </Link>
        <Link href="/transaction/create">
          <Button className="flex items-center gap-2">
            <PenBox size={18} />
            <span className="hidden md:inline">Add Transaction</span>
          </Button>
        </Link>
        <UserButton appearance={{ elements: { avatarBox: "w-10 h-10" } }} />
      </Show>
    </>
  );
};
