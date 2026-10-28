export type EmailContent = { subject: string; html: string; text: string };
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function emailTemplate(subject: string, name: string, paragraphs: string[], label: string, url: string, unsubscribeUrl?: string): EmailContent {
  const safe = escapeHtml;
  const text = [`Hi ${name},`, ...paragraphs, `${label}: ${url}`, ...(unsubscribeUrl ? [`Manage this email: ${unsubscribeUrl}`] : []), "Grind"].join("\n\n");
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f5f2;color:#171717;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:12px"><p style="font-weight:900;letter-spacing:2px">GRIND</p><h1 style="font-size:26px">${safe(subject)}</h1><p>Hi ${safe(name)},</p>${paragraphs.map((p) => `<p style="line-height:1.6;white-space:pre-line">${safe(p)}</p>`).join("")}<p><a href="${safe(url)}" style="display:inline-block;padding:14px 20px;background:#d5fc47;color:#171717;border-radius:8px;font-weight:bold">${safe(label)}</a></p><p style="font-size:12px;word-break:break-all">Or open: <a href="${safe(url)}">${safe(url)}</a></p>${unsubscribeUrl ? `<p style="font-size:12px"><a href="${safe(unsubscribeUrl)}">Unsubscribe from this email</a> · <a href="${safe(new URL("/settings", url).href)}">Email settings</a></p>` : ""}<p style="font-size:12px;color:#666">Run it. Lift it. Grind it out.</p></div></body></html>`;
  return { subject, html, text };
}

export function accountEmail(kind: "verify" | "reset" | "password-changed" | "welcome", name: string, url: string) {
  switch (kind) {
    case "verify": return emailTemplate("Verify your email", name, ["Confirm this email address to finish setting up your Grind account.", "This link expires in 1 hour. If you didn't request this, you can ignore it."], "Verify email", url);
    case "reset": return emailTemplate("Reset your password", name, ["Use the link below to choose a new password. This link expires in 1 hour and can only be used once.", "If you didn't request this, you can ignore this email. Your password will stay the same."], "Reset password", url);
    case "password-changed": return emailTemplate("Your password was changed", name, ["Your Grind password was reset successfully. Your previous sessions have been signed out.", "If you didn't make this change, reset your password immediately."], "Go to Grind", url);
    case "welcome": return emailTemplate("Welcome to Grind", name, ["Your account is ready. Here's how to get started:", "1. Build your running and strength plan.\n2. Connect intervals.icu in Settings to sync your watch activities.\n3. Connect Claude if you'd like coaching and plan suggestions.", "You can turn on weekly training recaps and upcoming-week emails in Settings."], "Get started", url);
  }
}
