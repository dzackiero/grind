import { GrindMark } from "./grind-mark";

/**
 * The app mark, moving: the plate's rim turns while the bean stays still. Used while a page loads and on the
 * opening screen of the installed app. No text on purpose, like the icon the system shows just before it.
 * Motion stops for people who ask for less of it (prefers-reduced-motion); the mark then simply sits there.
 */
export function BrandLoader({ size = 56, className, label = "Loading" }: { size?: number; className?: string; label?: string }) {
  return <GrindMark animated size={size} label={label || undefined} className={className} />;
}
