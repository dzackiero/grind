/*
 * The Grind mark: a lime disc with teeth on its rim and a hole in the middle, like the burr of a coffee grinder. It
 * is also a weight plate for lifting. One drawing on a 64-unit grid, used by the Logo component, the app icons, the
 * loader and the static files in public/brand and app/icon.svg. A test keeps the static files in step with these
 * numbers.
 *
 * The teeth are a thick ring drawn as dashes. The dash lengths are worked out from the ring's circumference, not left
 * to SVG's pathLength, because the icon renderer and design tools such as Illustrator and Inkscape ignore pathLength
 * and would draw hundreds of hairline teeth.
 */
const TEETH_RADIUS = 28.44;
const TEETH_COUNT = 24;
/** How much of each tooth's width is the tooth itself, the rest is the gap */
const TOOTH_SHARE = 0.62;
const toothWidth = (2 * Math.PI * TEETH_RADIUS) / TEETH_COUNT;

export const MARK = {
  /** The drawing is 64 × 64; every other number is in these units */
  size: 64,
  /** The lime disc */
  discRadius: 26.6,
  /** The teeth: a thick ring drawn as dashes outside the disc */
  teethRadius: TEETH_RADIUS,
  teethWidth: 4.5,
  teethCount: TEETH_COUNT,
  /** Dash and gap in drawing units; they add up to one tooth, so 24 of them close the ring exactly */
  teethDash: `${(toothWidth * TOOTH_SHARE).toFixed(4)} ${(toothWidth * (1 - TOOTH_SHARE)).toFixed(4)}`,
  /** The teeth are turned a little so none sits exactly at the top */
  teethOffsetAngle: -4,
  /** A fine ring on the face, the groove of the burr */
  innerRingRadius: 18.9,
  innerRingWidth: 2.7,
  innerRingOpacity: 0.25,
  /** The hole in the middle */
  hubRadius: 8.1,
  lime: "#c8f135",
  ink: "#121410",
  /** The app's dark background, behind the mark on app icons */
  dark: "#0d0f0c",
} as const;

/** The mark (teeth included) takes this share of an app icon, inside the safe zone maskable icons need. */
export const ICON_PLATE_SHARE = 0.62;
