import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mcpResource } from "@/server/auth/create-auth";
import { getDb } from "@/server/db";
import { countSynced, getIntervalsStatus } from "@/server/intervals/sync";
import { listConnectedApps } from "@/server/mcp/connections";
import { requireViewer } from "@/server/queries";
import { ClaudeConnect } from "./claude-connect";
import { InstallApp } from "./install-app";
import { IntervalsConnect } from "./intervals-connect";

export const metadata = { title: "Settings · Grind" };

export default async function SettingsPage() {
  const user = await requireViewer();
  const db = await getDb();
  const [status, counts, apps] = await Promise.all([getIntervalsStatus(db, user.id), countSynced(db, user.id), listConnectedApps(db, user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-extrabold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">intervals.icu</CardTitle>
          <CardDescription>Your Huawei watch syncs to intervals.icu. Grind reads your runs, strength sessions, HRV, resting heart rate and sleep from there.</CardDescription>
        </CardHeader>
        <CardContent>
          <IntervalsConnect status={status} counts={counts} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Claude</CardTitle>
          <CardDescription>Let Claude be your coach. It can read your plan and training, and suggest changes that you accept or decline in Grind.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClaudeConnect mcpUrl={mcpResource()} isLocal={/^https?:\/\/(localhost|127\.|\[::1\])/.test(mcpResource())} apps={apps} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Install Grind</CardTitle>
          <CardDescription>Add Grind to your home screen. It opens full screen like an app.</CardDescription>
        </CardHeader>
        <CardContent>
          <InstallApp />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Account</CardTitle>
          <CardDescription>
            Signed in as <b className="text-foreground">{user.email}</b>
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
