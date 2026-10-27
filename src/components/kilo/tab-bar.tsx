"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { CalendarDays, ClipboardList, Sun } from "lucide-react";

const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/plan", label: "Plan", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

/** Bottom navigation. Progress and Coach tabs arrive with their features. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="bg-card fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-3 px-2 pt-2 pb-2.5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 text-[11px] font-semibold", active ? "text-foreground" : "text-subtle")}>
                <span className={cn("grid h-[30px] w-[52px] place-items-center rounded-full", active && "bg-primary text-primary-foreground")}>
                  <Icon className="size-[22px]" strokeWidth={1.75} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
