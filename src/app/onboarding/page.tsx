import { Logo } from "@/components/kilo/logo";
import { getViewerPlan, requireViewer } from "@/server/queries";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Build your plan · Grind" };

// These pages read the signed-in athlete, so they are rendered per request and never during the build.
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireViewer();
  const existing = await getViewerPlan();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <Logo />
      <OnboardingForm firstName={user.name.split(" ")[0]} hasPlan={!!existing} />
    </main>
  );
}
