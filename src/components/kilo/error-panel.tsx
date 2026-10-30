import { cn } from "cn";
import { GrindMark } from "./grind-mark";

/**
 * What the error and not-found pages say: the mark, a short headline, one calm sentence and the actions. Never the
 * error's own message, which can name internals; `digest` is only a reference the athlete can quote, and it matches
 * the line in the server logs. `fullPage` centres it on a screen of its own (outside the app shell).
 */
export function ErrorPanel({
  title,
  description,
  digest,
  fullPage = false,
  children,
}: {
  title: string;
  description: string;
  digest?: string;
  fullPage?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "mx-auto flex max-w-sm flex-col items-start gap-6",
        fullPage ? "min-h-dvh justify-center px-4 py-10" : "py-8",
      )}
    >
      <GrindMark size={48} />
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
        {digest ? (
          <p className="text-muted-foreground font-mono text-xs">Reference: {digest}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </div>
  );
}
