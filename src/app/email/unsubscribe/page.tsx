import { AuthShell } from "@/components/kilo/auth-shell";
import { Button } from "@/components/ui/button";
import { readUnsubscribeToken } from "@/server/email/unsubscribe";

export const metadata = { title: "Email preferences · Grind" };
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  const { token = "", done } = await searchParams;
  const data = readUnsubscribeToken(token);
  return (
    <AuthShell
      title={done === "1" ? "You're unsubscribed" : "Unsubscribe"}
      description={
        done === "1"
          ? "You can turn this email back on in Settings any time."
          : "Choose whether to stop receiving this weekly email."
      }
    >
      {done !== "1" &&
        (data ? (
          <form
            action={`/api/email/unsubscribe?${new URLSearchParams({ token })}`}
            method="post"
            className="space-y-4"
          >
            <p>
              Stop receiving{" "}
              {data.kind === "weekly-recap" ? "weekly training recaps" : "week-ahead previews"}?
              Your other email preferences will stay the same.
            </p>
            <Button type="submit">Unsubscribe</Button>
          </form>
        ) : (
          <p role="alert">This link is invalid. You can manage weekly emails in Settings.</p>
        ))}
    </AuthShell>
  );
}
