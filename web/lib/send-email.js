// lib/send-email.js  ← new file, no "use server"
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, react }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY in environment variables");
  }

  const { data, error } = await resend.emails.send({
    from: "Redex Finance App <onboarding@resend.dev>",
    to,
    subject,
    react,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  return { success: true, data };
}
