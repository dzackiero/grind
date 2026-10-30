import Link from "next/link";
import { ErrorPanel } from "@/components/kilo/error-panel";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <ErrorPanel fullPage title="Page not found" description="That page doesn't exist, or it has moved.">
      <Button asChild><Link href="/today">Back to Today</Link></Button>
    </ErrorPanel>
  );
}
