import arcjet, { createMiddleware, detectBot, shield } from "@arcjet/next";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/account(.*)",
  "/transaction(.*)",
  "/budget-splitter(.*)",
]);

const aj = arcjet({
  key: process.env.ARCJET_KEY,
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      allow: ["GO_HTTP", "CHROME", "FIREFOX", "SAFARI", "CURL"],
    }),
  ],
});

const arcjetMiddleware = createMiddleware(aj);

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // 1. BYPASS FOR MOBILE APP
  if (pathname === "/api/transactions") {
    return NextResponse.next();
  }

  // 2. CHECK PROTECTED ROUTES
  // ✅ Next.js 15 Fix: Fully await auth() before accessing properties
  const session = await auth();
  const userId = session?.userId;

  if (!userId && isProtectedRoute(req)) {
    return session.redirectToSignIn(); // Use the awaited session object
  }

  // 3. ARCJET — only in production
  if (process.env.NODE_ENV === "production") {
    // ✅ Next.js 15 Fix: Ensure arcjetMiddleware is called correctly
    // within the async flow. Arcjet's Next.js 15 adapter requires
    // the headers to be handled asynchronously.
    const res = await arcjetMiddleware(req);
    if (res) return res;
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
