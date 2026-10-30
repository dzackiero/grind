import { SaveAccountForm } from "@/components/kilo/save-account-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mcpResource } from "@/server/auth/create-auth";
import { getDb } from "@/server/db";
import { countSynced, getIntervalsStatus } from "@/server/intervals/sync";
import { listConnectedApps } from "@/server/mcp/connections";
import { requireViewer } from "@/server/queries";
import { ClaudeConnect } from "./claude-connect";
import { EmailSettings } from "./email-settings";
import { getEmailPreferences } from "@/server/email/preferences";
import { emailConfigured } from "@/server/email/transport";
import { getTimezone } from "@/server/profile/service";
import { InstallApp } from "./install-app";
import { IntervalsConnect } from "./intervals-connect";

export const metadata = { title: "Settings · Grind" };

export default async function SettingsPage() {
  const user = await requireViewer();
  const db = await getDb();
  const [status, counts, apps] = await Promise.all([getIntervalsStatus(db, user.id), countSynced(db, user.id), listConnectedApps(db, user.id)]);
  const [preferences, timezone] = await Promise.all([getEmailPreferences(db, user.id), getTimezone(db, user.id)]);

  const intervalsCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">intervals.icu</CardTitle>
        <CardDescription>Your Huawei watch syncs to intervals.icu. Grind reads your runs, strength sessions, HRV, resting heart rate and sleep from there.</CardDescription>
      </CardHeader>
      <CardContent>
        <IntervalsConnect status={status} counts={counts} />
      </CardContent>
    </Card>
  );

  const claudeCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Claude</CardTitle>
        <CardDescription>Let Claude be your coach. It can read your plan and training, and suggest changes that you accept or decline in Grind.</CardDescription>
      </CardHeader>
      <CardContent>
        {user.isAnonymous ? (
          <p className="text-muted-foreground text-sm">
            Claude needs a saved account to connect. <a href="#save-account" className="text-accent-ink font-semibold">Save yours</a> first.
          </p>
        ) : (
          <ClaudeConnect mcpUrl={mcpResource()} isLocal={/^https?:\/\/(localhost|127\.|\[::1\])/.test(mcpResource())} apps={apps} />
        )}
      </CardContent>
    </Card>
  );

  const installCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Install Grind</CardTitle>
        <CardDescription>Add Grind to your home screen. It opens full screen like an app.</CardDescription>
      </CardHeader>
      <CardContent>
        <InstallApp />
      </CardContent>
    </Card>
  );

  const accountCard = (
    <Card id="save-account" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{user.isAnonymous ? "Save your account" : "Account"}</CardTitle>
        <CardDescription>
          {user.isAnonymous ? (
            "You're on a guest account that only lives in this browser. Add an email and password to keep your plan and log, and to sign in anywhere."
          ) : (
            <>
              Signed in as <b className="text-foreground">{user.email}</b>
            </>
          )}
        </CardDescription>
      </CardHeader>
      {user.isAnonymous && (
        <CardContent>
          <SaveAccountForm name={user.name} />
        </CardContent>
      )}
      {!user.isAnonymous && (
        <CardContent>
          <EmailSettings preferences={preferences} timezone={timezone} verified={user.emailVerified} email={user.email} enabled={emailConfigured()} />
        </CardContent>
      )}
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-extrabold">Settings</h1>
      {/* Two independent columns, so a short card never leaves a gap in the row beside it */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {intervalsCard}
          {installCard}
        </div>
        <div className="flex flex-col gap-6">
          {user.isAnonymous ? (
            <>
              {accountCard}
              {claudeCard}
            </>
          ) : (
            <>
              {claudeCard}
              {accountCard}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
