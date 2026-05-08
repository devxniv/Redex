import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/account(.*)",
  "/transaction(.*)",
  "/budget-splitter(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // 1. BYPASS FOR MOBILE APP
  if (pathname === "/api/transactions") {
    return NextResponse.next();
  }

  // 2. CHECK PROTECTED ROUTES
  // Next.js 15 Fix: auth() must be fully awaited
  const authObj = await auth();

  if (!authObj.userId && isProtectedRoute(req)) {
    // Correct way to redirect in Next.js 15 with Clerk
    return authObj.redirectToSignIn();
  }

  // 3. ARCJET (If you uncomment this later)
  // Ensure you have run: npm install @arcjet/next@latest
  // Older versions of Arcjet triggered the 'headers()' error in Next 15.

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
