import React from "react";
import Image from "next/image";
import Link from "next/link";
import { checkUser } from "@/lib/checkUser";
import { ClerkAuthWrapper } from "./clerk-auth-wrapper"; // Import your new component

const Header = async () => {
  // Database check (Server Side)
  await checkUser();

  return (
    <div className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b">
      <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/">
          <Image
            src="/logo.png"
            alt="redex logo"
            height={100}
            width={200}
            className="h-12 w-auto object-contain"
          />
        </Link>

        <div className="flex items-center space-x-4">
          {/* This wrapper ensures Clerk components render on the client */}
          <ClerkAuthWrapper />
        </div>
      </nav>
    </div>
  );
};

export default Header;
