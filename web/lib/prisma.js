import { PrismaClient } from "@prisma/client";

// Create a single instance of PrismaClient.
// Reuse the existing instance if it exists (important for development with hot-reloading),
// otherwise, create a new instance.
export const db = globalThis.prisma || new PrismaClient();

// In development mode, assign the PrismaClient instance to a global variable.
// This prevents multiple instances from being created during hot-reloading.
if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = db;
}
