/*
 * The Grind mark: a lime weight plate seen from above, with a coffee bean on it. The plate is the training,
 * the bean is the coffee (and the CUP family). One drawing on a 64-unit grid, used by the Logo component, the
 * app icons, the loader and the static files in public/brand and app/icon.svg. A test keeps the static files
 * in step with these numbers.
 */
export const MARK = {
  /** The drawing is 64 × 64; every other number is in these units */
  size: 64,
  plateRadius: 32,
  ringRadius: 23.5,
  ringWidth: 3,
  beanRx: 13,
  beanRy: 19,
  /** The bean leans back 30 degrees around the centre of the plate */
  beanAngle: -30,
  /** The bean's crease before the lean: top to bottom through the centre, in an S */
  creasePath: "M32 13.8 C39.6 24.4 24.4 39.6 32 50.2",
  creaseWidth: 2.8,
  lime: "#c8f135",
  ink: "#121410",
  /** The app's dark background, behind the plate on app icons */
  dark: "#0d0f0c",
} as const;

/** The plate takes this share of an app icon, inside the safe zone maskable icons need. */
export const ICON_PLATE_SHARE = 0.6;
