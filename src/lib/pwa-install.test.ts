import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("PWA install lifecycle", () => {
  let browser: EventTarget & { matchMedia: () => { matches: boolean } };

  beforeEach(() => {
    vi.resetModules();
    browser = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("navigator", { standalone: false });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("retains a prompt received before Settings subscribes", async () => {
    const { pwaInstall } = await import("./pwa-install");
    const stop = pwaInstall.start();
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    browser.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(pwaInstall.getSnapshot().prompt).toBe(event);
    stop();
  });

  it("consumes the prompt once, including when dismissed", async () => {
    const { pwaInstall } = await import("./pwa-install");
    const stop = pwaInstall.start();
    let calls = 0;
    browser.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt"), {
        prompt: async () => {
          calls++;
        },
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      }),
    );
    await Promise.all([pwaInstall.install(), pwaInstall.install()]);
    expect(calls).toBe(1);
    expect(pwaInstall.getSnapshot()).toEqual({ prompt: null, installed: false });
    stop();
  });

  it("notifies subscribers and clears a pending prompt when installed", async () => {
    const { pwaInstall } = await import("./pwa-install");
    const stop = pwaInstall.start();
    browser.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt"), { prompt: async () => {} }),
    );
    const snapshots: unknown[] = [];
    const unsubscribe = pwaInstall.subscribe(() => snapshots.push(pwaInstall.getSnapshot()));
    browser.dispatchEvent(new Event("appinstalled"));
    expect(snapshots).toEqual([{ prompt: null, installed: true }]);
    unsubscribe();
    stop();
  });

  it("recognizes an iOS standalone launch", async () => {
    vi.stubGlobal("navigator", { standalone: true });
    const { pwaInstall } = await import("./pwa-install");
    const stop = pwaInstall.start();
    expect(pwaInstall.getSnapshot().installed).toBe(true);
    stop();
  });

  it("clears a rejected prompt without an unhandled error", async () => {
    const { pwaInstall } = await import("./pwa-install");
    const stop = pwaInstall.start();
    browser.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt"), {
        prompt: async () => {
          throw new Error("Prompt unavailable");
        },
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      }),
    );
    await expect(pwaInstall.install()).resolves.toBeUndefined();
    expect(pwaInstall.getSnapshot().prompt).toBeNull();
    stop();
  });
});
