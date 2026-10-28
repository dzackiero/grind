import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl?: string;
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export async function sendEmail(message: EmailMessage, key: string): Promise<string> {
  if (!emailConfigured()) throw new Error("Email delivery is not configured.");
  const { unsubscribeUrl, ...content } = message;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      ...content, to: [message.to], from: process.env.EMAIL_FROM,
      ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  // Provider response bodies may contain recipients or other private data.
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Email provider did not return a delivery ID.");
  return result.id;
}
