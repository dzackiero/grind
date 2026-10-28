import { ImageResponse } from "next/og";
import { PlateMark } from "@/lib/pwa-mark";

// Built once at deploy time; the manifest points at these two sizes
export const dynamic = "force-static";

const SIZES = [192, 512];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

/** PNG app icon: /pwa-icon/192 and /pwa-icon/512. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<PlateMark size={size} />, { width: size, height: size });
}
