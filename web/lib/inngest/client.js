import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "Redex", // Unique app ID
  name: "Redex",
  retryFunction: async (attempt) => ({
    delay: Math.pow(2, attempt) * 1000, // Exponential backoff
    maxAttempts: 10,
  }),
});
