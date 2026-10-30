import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Link back to the page you came from, pulled left so the arrow lines up with the page's content edge. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="-ml-3 self-start">
      <Button variant="ghost" size="sm" asChild>
        <Link href={href}>
          <ArrowLeft /> {children}
        </Link>
      </Button>
    </div>
  );
}
