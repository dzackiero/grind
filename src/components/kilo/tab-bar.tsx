"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { CalendarDays, ChartColumn, ClipboardList, Sun, type LucideIcon } from "lucide-react";
import { tabBarInnerClassName } from "@/lib/app-shell";

const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/plan", label: "Plan", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: ChartColumn },
];

/** Inside the Link so it can read the link's pending state: the tab lights up on the tap, not when the page arrives. */
function TabFace({
  label,
  icon: Icon,
  active,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <>
      <span
        className={cn(
          "grid h-8 w-14 place-items-center rounded-full transition-colors",
          on ? "bg-primary text-primary-foreground" : "group-active:bg-secondary",
        )}
      >
        <Icon className="size-5.5" strokeWidth={1.75} />
      </span>
      {label}
    </>
  );
}

/**
 * Bottom navigation. Each link fills its whole quarter of the bar and the full bar height (about 96 × 64 px),
 * well past the 44 px minimum for a thumb, not just the icon and label. Links are prefetched in full so the
 * next tab is already loaded when it is tapped.
 */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="bg-card fixed inset-x-0 bottom-0 z-40 border-t pb-safe">
      <ul className={tabBarInnerClassName}>
        {TABS.map(({ href, label, icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-16 w-full touch-manipulation flex-col items-center justify-center gap-1 text-xs font-semibold select-none",
                  active ? "text-foreground" : "text-subtle",
                )}
              >
                <TabFace label={label} icon={icon} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
