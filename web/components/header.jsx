// Navigation bar
import React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  SignUpButton,
} from "@clerk/nextjs";
import { Button } from "./ui/button";
import { LayoutDashboard, PenBox } from "lucide-react";
import { checkUser } from "@/lib/checkUser";

const Header = async () => {
  // Before rendering header, make sure the logged-in user exists in your database
  await checkUser();

  return (
    <div className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b">
      <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* left side of navbar */}
        <Link href="/">
          <Image
            src="/logo.png"
            alt="redex logo"
            height={100}
            width={200}
            className="h-12 w-auto object-contain"
          />
        </Link>

        {/* Right side of navbar */}
        <div className="flex items-center space-x-4">
          <SignedOut>
            <SignInButton forceRedirectUrl="/dashboard">
              <Button variant="outline">Login</Button>
            </SignInButton>

            <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
              <Button variant="outline">Sign Up</Button>
            </SignUpButton>
          </SignedOut>

          <SignedIn>
            <Link
              href="/dashboard"
              className="text-gray-600 hover:text-blue-600"
            >
              <Button variant="outline" className="flex items-center gap-2">
                <LayoutDashboard size={18} />
                <span className="hidden md:inline">Dashboard</span>
              </Button>
            </Link>

            <Link
              href="/transaction/create"
              className="text-gray-600 hover:text-blue-600"
            >
              <Button className="flex items-center gap-2">
                <PenBox size={18} />
                <span className="hidden md:inline">Add Transaction</span>
              </Button>
            </Link>

            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-10 h-10",
                },
              }}
            />
          </SignedIn>
        </div>
      </nav>
    </div>
  );
};

export default Header;
