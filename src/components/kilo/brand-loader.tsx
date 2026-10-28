import { cn } from "cn";

/**
 * The app mark, moving: the same lime plate as the logo and the app icon, with its rim turning and its hub
 * beating slowly. Used while a page loads and on the opening screen of the installed app. No text on purpose,
 * like the icon the system shows just before it. Motion stops for people who ask for less of it
 * (prefers-reduced-motion); the plate then simply sits there.
 */
export function BrandLoader({ size = 56, className, label = "Loading" }: { size?: number; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} role="img" aria-label={label} className={cn("brand-loader", className)}>
      <circle cx="16" cy="16" r="16" className="fill-primary" />
      <circle cx="16" cy="16" r="10" fill="none" strokeWidth="3" pathLength="100" strokeDasharray="21 4" strokeLinecap="round" className="brand-loader-rim stroke-primary-foreground/45" />
      <circle cx="16" cy="16" r="4" className="brand-loader-hub fill-primary-foreground" />
    </svg>
  );
}
