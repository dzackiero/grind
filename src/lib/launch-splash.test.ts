import { describe, expect, it } from "vitest";
import { LAUNCH_SPLASH_FAILSAFE_MS, LAUNCH_SPLASH_KEY, LAUNCH_SPLASH_SCRIPT } from "./launch-splash";

/** Runs the head script against a stand-in browser and reports what it did. */
function run(env: { standalone?: boolean; iosStandalone?: boolean; reducedMotion?: boolean; alreadyShown?: boolean; storageThrows?: boolean }) {
  const attributes = new Map<string, string>();
  const timers: { fn: () => void; ms: number }[] = [];
  const store = new Map<string, string>(env.alreadyShown ? [[LAUNCH_SPLASH_KEY, "1"]] : []);
  const sessionStorage = {
    getItem: (k: string) => {
      if (env.storageThrows) throw new Error("blocked");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  const matchMedia = (query: string) => ({ matches: query.includes("standalone") ? !!env.standalone : query.includes("reduced-motion") ? !!env.reducedMotion : false });
  const document = { documentElement: { setAttribute: (k: string, v: string) => void attributes.set(k, v), removeAttribute: (k: string) => void attributes.delete(k) } };
  const navigator = { standalone: env.iosStandalone };
  const setTimeout = (fn: () => void, ms: number) => void timers.push({ fn, ms });
  new Function("document", "matchMedia", "navigator", "sessionStorage", "setTimeout", LAUNCH_SPLASH_SCRIPT)(document, matchMedia, navigator, sessionStorage, setTimeout);
  return { attributes, timers, store };
}

describe("launch splash script", () => {
  it("shows the splash the first time the installed app opens, and remembers it", () => {
    const { attributes, store } = run({ standalone: true });
    expect(attributes.get("data-splash")).toBe("on");
    expect(store.get(LAUNCH_SPLASH_KEY)).toBe("1");
  });

  it("also works on iOS, which reports an installed app through navigator.standalone", () => {
    expect(run({ iosStandalone: true }).attributes.get("data-splash")).toBe("on");
  });

  it("doesn't show it again within the same launch", () => {
    expect(run({ standalone: true, alreadyShown: true }).attributes.has("data-splash")).toBe(false);
  });

  it("never shows it in an ordinary browser tab", () => {
    const { attributes, store } = run({ standalone: false });
    expect(attributes.has("data-splash")).toBe(false);
    expect(store.has(LAUNCH_SPLASH_KEY)).toBe(false);
  });

  it("skips it for people who ask for reduced motion", () => {
    expect(run({ standalone: true, reducedMotion: true }).attributes.has("data-splash")).toBe(false);
  });

  it("removes the splash by itself if the app never starts", () => {
    const { attributes, timers } = run({ standalone: true });
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(LAUNCH_SPLASH_FAILSAFE_MS);
    timers[0].fn();
    expect(attributes.has("data-splash")).toBe(false);
  });

  it("does nothing, and doesn't throw, when storage is blocked", () => {
    expect(() => run({ standalone: true, storageThrows: true })).not.toThrow();
    expect(run({ standalone: true, storageThrows: true }).attributes.has("data-splash")).toBe(false);
  });
});
