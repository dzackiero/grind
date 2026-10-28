import { ImageResponse } from "next/og";
import { PlateMark } from "@/lib/pwa-mark";

// iOS "Add to Home Screen" icon. Next links it automatically as <link rel="apple-touch-icon">.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<PlateMark size={size.width} />, size);
}
