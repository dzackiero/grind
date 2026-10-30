import Link from "next/link";
import { Logo } from "./logo";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {children}
      <Link href="/sign-in" className="text-muted-foreground text-sm underline">
        Back to sign in
      </Link>
    </main>
  );
}
