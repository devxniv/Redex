# Redex — AI-Powered Expense Tracker

> Automatic expense tracking with real-time Android capture, a Next.js web dashboard, and an async job pipeline. No manual entry required.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Android Companion App](#android-companion-app)
- [Web Dashboard (Next.js)](#web-dashboard-nextjs)
- [Budget Splitter](#budget-splitter)
- [Backend & Data Pipeline](#backend--data-pipeline)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)

---

## Overview

Redex started as a web-only expense tracker, but manual data entry is the reason most expense apps fail — people forget to log, or find it tedious. To solve this, an Android companion app was built to capture financial transactions automatically from notifications, shared screenshots, and SMS — and forward them to the web platform in real time.

**Key capabilities:**
- Automatic transaction capture from UPI/bank notifications and payment screenshots on Android
- AI-powered data extraction from payment screenshots using Google Gemini
- Full-featured web dashboard with charts, budget tracking, and transaction management
- Offline-first Android architecture with local queue and background retry
- Async job pipeline for recurring transactions, monthly email reports, and budget alerts
- Group expense splitting with an advanced debt-minimisation algorithm

---

## Architecture

```
┌─────────────────────────────────────────┐
│           Android Companion App         │
│                                         │
│  Notification  Share Intake  SMS        │
│   Listener      (Image)    Receiver     │
│       └──────────┬──────────┘           │
│              GeminiParser               │
│           (AI Extraction)               │
│                  │                      │
│           Deduplicator                  │
│                  │                      │
│            HttpSender  ←→  Room DB      │
│                  │       (Offline Queue)│
└──────────────────┼──────────────────────┘
                   │ HTTP POST
┌──────────────────┼──────────────────────┐
│         Web Platform (Next.js)          │
│                  │                      │
│        /api/transactions                │
│                  │                      │
│    ┌─────────────┴──────────────┐       │
│    │                            │       │
│  Prisma DB              Inngest Jobs    │
│  (PostgreSQL)        (Recurring Txns +  │
│                       Email Reports +   │
│                       Budget Alerts)    │ 
│    │                            │       │
│  Dashboard          Email Template      │
│  (Charts, Budget,   (Monthly Report +   │
│   Transactions)      Budget Alert)      │
└─────────────────────────────────────────┘
```

---

## Android Companion App

Located in `/android`. Built with Kotlin for Android (minSdk 27).

### What It Does

The Android app runs silently in the background. It has three ways to capture a transaction:

**1. Notification Listener (`RedexNotificationListener.kt`)**
Listens to payment notifications from apps like GPay, PhonePe, Paytm, and bank apps. When a financial notification arrives, it's forwarded to `GeminiParser` for AI extraction.

**2. Share Intake (`ShareReceiverActivity.kt`)**
Appears in the Android share sheet when you share any image. Lets you share a UPI payment screenshot directly to Redex. Includes a file size check (max 5MB), a rate-limit guard (`ShareGuard`), and a confirmation dialog before saving.

### AI Extraction (`GeminiParser.kt`)

All captured data passes through `GeminiParser`, which uses Google Gemini (`gemini-1.5-flash`) to extract structured transaction data:

```json
{
  "amount": 249.00,
  "date": "2026-04-13",
  "description": "Zomato order payment",
  "merchantName": "Zomato",
  "category": "food",
  "is_transaction": true,
  "type": "EXPENSE"
}
```

Includes fuzzy category normalization to handle inconsistent Gemini responses, and a 3-attempt retry loop with 2s delay for image parsing.

### Offline-First Architecture

If the server is unreachable, transactions are saved to a local Room database (`PendingTransaction`) and a `WorkManager` job (`TransactionWorker`) is scheduled to retry automatically when the device comes back online.

```
Send attempt → Success → Done
            → Failure → Save to Room DB
                          → WorkManager retries on network reconnect
                          → Deletes from DB after successful send
```

### Security

- API secret sent in every request via `X-Redex-Api-Secret` header (stored in `BuildConfig`, never hardcoded)
- Caller package logging for share intents
- Duplicate detection via `TransactionDeduplicator` (prevents double-logging the same transaction)
- Rate limiting via `ShareGuard` (3-second cooldown between share intents)

### App Screens

- **MainActivity** — Dashboard link, permission status, monitoring controls
- **SettingsActivity** — App whitelist manager (control which apps trigger capture)

---

## Web Dashboard (Next.js)

Located in `/web`. Built with Next.js 14 (App Router), Tailwind CSS, and shadcn/ui.

### Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/dashboard` | Overview: balance, recent transactions, budget progress |
| `/account/[id]` | Per-account transaction history with charts |
| `/transaction/create` | Manual transaction entry + receipt scanner |
| `/budget-splitter` | Group expense splitting with debt minimisation |

### Features

**Dashboard (`/dashboard`)**
- Account balance cards with income/expense summary
- Transaction overview chart (bar chart by category or date)
- Budget progress bar with percentage used
- Quick-add transaction button

**Account View (`/account/[id]`)**
- Account-level balance chart over time
- Full transaction table with search, sort, and filter
- Filter by type (income/expense) and recurring status
- Bulk delete selected transactions

**Transaction Form (`/transaction/create`)**
- Manual entry with category, amount, date, merchant
- Recurring transaction support (daily/weekly/monthly/yearly)
- Receipt scanner (AI-powered image upload via Gemini)
- Edit mode for existing transactions

### Authentication

Handled by Clerk (`middleware.js`). Protected routes under `/(main)` require a signed-in user. Auth routes under `/(auth)` handle sign-in and sign-up.

### Rate Limiting

Arcjet (`lib/arcjet.js`) is integrated for API route protection against abuse.

---

## Budget Splitter

Located at `/budget-splitter`. A full group expense splitting tool that minimises the number of cash transfers needed to settle all debts.

### How It Works

Each user gets one persistent group. Members are added to the group, expenses are logged against the group, and the app calculates who owes whom using a greedy debt-minimisation algorithm — reducing n(n-1)/2 possible transfers down to the minimum needed.

### Features

- **Member management** — Add, rename, or remove members. Removal safely cascades and deletes all related expenses, splits, and settlements.
- **Expense logging** — Record any expense with a description, amount, category (Food, Transport, Accommodation, Entertainment, Groceries, Healthcare, Activity, Other), and the member who paid.
- **Equal splitting** — Amount is split equally across all members by default.
- **Net balance view** — Each member's paid, owed, and settled amounts are displayed with a colour-coded net balance (green = is owed, red = owes).
- **Debt simplification** — `simplifyDebts()` uses a greedy creditor/debtor pairing algorithm to produce the minimum number of transactions needed to zero all balances.
- **Settlement tracking** — Mark a suggested payment as settled. Partial settlements are supported — paying ₹40 then ₹60 of a ₹100 debt is handled correctly without needing an exact amount match.
- **Undo settlements** — Remove a settlement if it was marked paid by mistake.

### Algorithm

`getNetBalances` computes each member's net position:

```
balance = paid − owes + settled_adjustments
```

Settlements are applied symmetrically: the payer's balance increases (reduces what they owe), the payee's balance decreases (reduces what they're owed). This means partial payments accumulate naturally.

`simplifyDebts` then greedily pairs the largest creditor with the largest debtor each round, producing the fewest possible transfers to zero all balances.

### Database Models

| Model | Purpose |
|-------|---------|
| `BudgetGroup` | One group per user, holds members, expenses, and settlements |
| `BudgetMember` | A named participant in the group |
| `BudgetExpense` | An expense with description, amount, category, and payer |
| `BudgetSplit` | Each member's share of a specific expense |
| `BudgetSettlement` | A recorded payment from one member to another |

---

## Backend & Data Pipeline

### Transactions API (`/api/transactions/route.js`)

Receives POST requests from the Android app. Validates the `X-Redex-Api-Secret` header, then stores the transaction in PostgreSQL via Prisma. Transaction category is already determined on-device by Gemini before the request is sent — no server-side categorization needed.

### Inngest Async Jobs (`lib/inngest/function.js`)

Three background jobs run via Inngest:

**1. Recurring Transaction Processor (`process-recurring-transaction`)**
Triggered by a `transaction.recurring.process` event. Automatically creates a new transaction entry for any recurring transaction that is due, updates the account balance, and calculates the next due date. Throttled to 10 transactions per minute per user to prevent database overload.

**2. Recurring Transaction Trigger (`trigger-recurring-transactions`)**
Runs daily at midnight via cron. Queries all active recurring transactions, checks which ones are due, and fires a `transaction.recurring.process` event for each — in batches.

**3. Monthly Financial Reports (`generate-monthly-reports`)**
Runs on the 1st of every month. For each user, calculates last month's total income, total expenses, and spending by category. Uses Google Gemini server-side to generate 3 personalised, actionable financial insights in plain English. Sends the full report as a formatted email via `EmailTemplate`.

**4. Budget Alerts (`check-budget-alerts`)**
Runs every 6 hours. Checks each user's default account spending against their configured budget. Sends a budget alert email when spending reaches 80% of the monthly budget — at most once per month per user.

### Database (`prisma/schema.prisma`)

PostgreSQL via Prisma ORM. Key models: `User`, `Account`, `Transaction`, `Budget`, `BudgetGroup`, `BudgetMember`, `BudgetExpense`, `BudgetSplit`, `BudgetSettlement`.

### Email (`emails/template.jsx`)

React Email templates for two email types:
- **Monthly Report** — Income, expenses, net savings, category breakdown, AI insights
- **Budget Alert** — Budget amount, amount spent, remaining balance, percentage used

Includes data validation before rendering to prevent broken emails being sent.

---

## Tech Stack

| Layer          | Technology                                              |
|----------------|---------------------------------------------------------|
| Android        | Kotlin, Coroutines, Room, WorkManager, OkHttp           |
| AI (Android)   | Google Gemini via generativeai SDK                      |
| Web Framework  | Next.js 14 (App Router)                                 |
| UI             | Tailwind CSS, shadcn/ui, Radix UI                       |
| Auth           | Clerk                                                   |
| Database       | PostgreSQL + Prisma ORM                                 |
| Async Jobs     | Inngest                                                 |
| Email          | React Email + Resend                                    |
| Rate Limiting  | Arcjet                                                  |
| Dev Tunnel     | ngrok                                                   |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Android Studio (for the Android app)
- PostgreSQL database (local or cloud e.g. Neon)
- ngrok (for local dev — connects Android app to local Next.js server)

### Web Setup

```bash
cd web
npm install
npx prisma generate
npx prisma db push
npm run dev
```

### Android Setup

1. Open `/android` in Android Studio
2. Create `local.properties` in the `/android` directory:
```
GEMINI_API_KEY=your_gemini_api_key
REDEX_API_SECRET=your_shared_secret
```
3. Sync Gradle and run on device/emulator

### Connecting Android to Web (Local Dev)

```bash
ngrok http --domain=your-ngrok-domain 3000
```

Update `SERVER_URL` in `HttpSender.kt` to your ngrok domain.

---

## Environment Variables

### Web (`web/.env.local`)

```env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
RESEND_API_KEY=
ARCJET_KEY=
GEMINI_API_KEY=            # Used server-side for monthly report insights
REDEX_API_SECRET=          # Must match Android's local.properties
```

### Android (`android/local.properties`)

```
GEMINI_API_KEY=your_gemini_api_key
REDEX_API_SECRET=your_shared_secret
```

> ⚠️ `local.properties` is in `.gitignore` — never commit API keys.

---

## Project Structure

```
Redex/
├── android/                    # Kotlin Android app
│   └── app/src/main/
│       └── java/.../
│           ├── GeminiParser.kt         # AI transaction extraction
│           ├── HttpSender.kt           # API client + offline queue
│           ├── RedexNotificationListener.kt
│           ├── ShareReceiverActivity.kt
│           ├── TransactionWorker.kt    # WorkManager retry job
│           ├── AppDatabase.kt          # Room database
│           ├── TransactionDeduplicator.kt
│           └── ShareGuard.kt
│
└── web/                        # Next.js web platform
    ├── app/
    │   ├── (auth)/             # Sign in / Sign up
    │   ├── (main)/             # Protected dashboard routes
    │   │   ├── dashboard/
    │   │   ├── account/[id]/
    │   │   ├── transaction/
    │   │   └── budget-splitter/    # Group expense splitter
    │   │       └── page.jsx
    │   └── api/
    │       ├── transactions/   # Android POST endpoint
    │       └── inngest/        # Inngest webhook
    ├── actions/                # Next.js server actions
    │   └── splitter.budget.js  # Budget splitter CRUD actions
    ├── components/
    │   └── budget-splitter.jsx # Main budget splitter UI component
    ├── lib/
    │   ├── budget-utils.js     # getNetBalances + simplifyDebts algorithm
    │   ├── inngest/function.js # Background jobs (recurring, reports, alerts)
    │   └── prisma.js
    ├── emails/template.jsx     # React Email templates
    └── prisma/schema.prisma
```
