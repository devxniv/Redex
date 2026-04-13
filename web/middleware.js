import arcjet, { createMiddleware, detectBot, shield } from "@arcjet/next";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/account(.*)",
  "/transaction(.*)",
]);

// Create Arcjet middleware
const aj = arcjet({
  key: process.env.ARCJET_KEY,
  // characteristics: ["userId"], // Track based on Clerk userId
  rules: [
    // Shield protection for content and security
    shield({
      mode: "LIVE",
    }),
    detectBot({
      mode: "LIVE", // Blocks malicious bots. Use "DRY_RUN" to log only
      allow: [
        "CATEGORY:SEARCH_ENGINE", // Google, Bing, Yandex, Baidu, etc
        "CATEGORY:MONITORING", // Uptime monitors, health checks
        "CATEGORY:PREVIEW", // Link preview tools (Discord, Slack embeds)
        "CATEGORY:ANALYTICS", // Analytics services, Mixpanel, Amplitude
        "CATEGORY:SOCIAL_MEDIA", // Twitter/X, Facebook, LinkedIn crawlers
        "GO_HTTP", // Go HTTP client (for Inngest)
        "CHROME", // Chrome browser
        "FIREFOX", // Firefox browser
        "SAFARI", // Safari browser
        "CURL", // curl requests (legitimate API clients)
      ],
    }),
  ],
});

// Create base middleware that chains ArcJet and Clerk
const arcjetMiddleware = createMiddleware(aj);

// Create combined middleware with Clerk
export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // 1. BYPASS FOR MOBILE APP
  // This allows Redex mobile to hit the API without Arcjet or Clerk blocking it
  if (pathname === "/api/transactions") {
    return NextResponse.next();
  }

  // 2. CHECK PROTECTED ROUTES
  const { userId } = await auth();
  if (!userId && isProtectedRoute(req)) {
    return auth().redirectToSignIn();
  }

  // 3. RUN ARCJET PROTECTION FOR EVERYTHING ELSE
  return arcjetMiddleware(req);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
