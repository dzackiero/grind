/*
 * The opening screen of the installed app. The system's own splash (the icon on a dark background, from the
 * web manifest on Android and the home screen icon on iOS) can't be animated, so once the app starts it shows
 * its own, moving, for about a second and a half. It appears once per launch, only in the installed app, never in a
 * browser tab, and not at all for people who ask for reduced motion.
 *
 * The decision is made by a tiny script that runs before the first paint, so the page never shows first and
 * then gets covered. It sets data-splash="on" on <html>; the CSS in globals.css does the rest, and
 * LaunchSplash (components/kilo/launch-splash.tsx) fades it out once the app is up.
 */

export const LAUNCH_SPLASH_KEY = "launch-splash";
/**
 * The splash stays at least this long once the app is running, so the animation is seen, not flashed. The mark pops
 * in, its groove draws, the hole opens and the teeth click once (see brand-loader in globals.css): about 1.2 seconds.
 */
export const LAUNCH_SPLASH_MIN_MS = 1400;
/** If the app never starts, the splash is removed after this long so it can't cover a broken page forever. */
export const LAUNCH_SPLASH_FAILSAFE_MS = 5000;

/** Runs in <head>. Plain ES5 on purpose; it must work before anything else has loaded. */
export const LAUNCH_SPLASH_SCRIPT = `(function(){try{var d=document.documentElement;var installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;if(!installed||matchMedia('(prefers-reduced-motion: reduce)').matches||sessionStorage.getItem('${LAUNCH_SPLASH_KEY}'))return;sessionStorage.setItem('${LAUNCH_SPLASH_KEY}','1');d.setAttribute('data-splash','on');setTimeout(function(){d.removeAttribute('data-splash')},${LAUNCH_SPLASH_FAILSAFE_MS})}catch(e){}})()`;
