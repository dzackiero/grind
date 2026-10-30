// Provider smoke test using Resend's documented delivery simulator, never a real user's inbox.
// Run: node --conditions=react-server --import=tsx scripts/email-check.mts
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
config({ path: [".env.local", ".env"], quiet: true });
const { sendEmail } = await import("../src/server/email/transport.ts");
const { accountEmail } = await import("../src/server/email/templates.ts");
const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
await sendEmail(
  {
    to: "delivered@resend.dev",
    ...accountEmail("welcome", "Delivery check", `${baseUrl}/onboarding`),
  },
  `grind-check-${randomUUID()}`,
);
console.log("Resend accepted the template using the configured sender and delivery simulator.");
