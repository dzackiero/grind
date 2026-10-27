import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/server/db";
import { countSynced, getIntervalsStatus } from "@/server/intervals/sync";
import { requireViewer } from "@/server/queries";
import { IntervalsConnect } from "./intervals-connect";

export const metadata = { title: "Settings · Kilo" };

export default async function SettingsPage() {
  const user = await requireViewer();
  const db = await getDb();
  const [status, counts] = await Promise.all([getIntervalsStatus(db, user.id), countSynced(db, user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-extrabold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">intervals.icu</CardTitle>
          <CardDescription>Your Huawei watch syncs to intervals.icu. Kilo reads your runs, strength sessions, HRV, resting heart rate and sleep from there.</CardDescription>
        </CardHeader>
        <CardContent>
          <IntervalsConnect status={status} counts={counts} />
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
