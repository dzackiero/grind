import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutoSync } from "./auto-sync";

class Page extends EventTarget {
  visibilityState = "visible";
  setVisible(visible: boolean) {
    this.visibilityState = visible ? "visible" : "hidden";
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

describe("automatic intervals sync", () => {
  const cleanups: (() => void)[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T00:00:00Z"));
  });
  afterEach(() => {
    cleanups.splice(0).forEach((stop) => stop());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(lastSyncedAt: string | null = null, visible = true, online = true) {
    const page = new Page();
    page.visibilityState = visible ? "visible" : "hidden";
    const events = new EventTarget();
    const network = { online };
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ activities: 1, wellnessDays: 1, matched: 1 }),
      );
    vi.stubGlobal("fetch", request);
    const onSuccess = vi.fn();
    const controller = createAutoSync({
      document: page,
      window: events,
      isOnline: () => network.online,
      lastSyncedAt,
      onSuccess,
    });
    cleanups.push(controller.stop);
    return { page, events, network, request, onSuccess, controller };
  }

  it("syncs on open and repeats after five minutes of freshness", async () => {
    const s = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.request).toHaveBeenCalledWith(
      "/api/intervals/sync",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
    expect(s.onSuccess).toHaveBeenCalledWith({ activities: 1, wellnessDays: 1, matched: 1 });
    s.events.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(299_999);
    expect(s.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.request).toHaveBeenCalledTimes(2);
    expect(s.onSuccess).toHaveBeenCalledTimes(2);
  });

  it("waits for visibility and connectivity and catches up on return", async () => {
    const s = setup(null, false, false);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(s.request).not.toHaveBeenCalled();
    s.page.setVisible(true);
    expect(s.request).not.toHaveBeenCalled();
    s.network.online = true;
    s.events.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.request).toHaveBeenCalledTimes(1);
    s.page.setVisible(false);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(s.request).toHaveBeenCalledTimes(1);
    s.page.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.request).toHaveBeenCalledTimes(2);
    s.network.online = false;
    s.events.dispatchEvent(new Event("offline"));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(s.request).toHaveBeenCalledTimes(2);
    s.network.online = true;
    s.events.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.request).toHaveBeenCalledTimes(3);
  });

  it.each(["http", "network"])(
    "retries %s failures after a minute without success callbacks",
    async (failure) => {
      const s = setup(new Date().toISOString());
      if (failure === "http")
        s.request.mockResolvedValueOnce(Response.json({ error: "Try later" }, { status: 503 }));
      else s.request.mockRejectedValueOnce(new Error("Connection lost"));
      await vi.advanceTimersByTimeAsync(300_000);
      expect(s.onSuccess).not.toHaveBeenCalled();
      s.events.dispatchEvent(new Event("focus"));
      s.events.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(59_999);
      expect(s.request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(s.request).toHaveBeenCalledTimes(2);
      expect(s.onSuccess).toHaveBeenCalledTimes(1);
    },
  );

  it("does not overlap requests when events or timers fire", async () => {
    const s = setup(new Date().toISOString());
    let finish!: (response: Response) => void;
    s.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(300_000);
    s.events.dispatchEvent(new Event("focus"));
    s.events.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(s.request).toHaveBeenCalledTimes(1);
    finish(Response.json({ matched: 0 }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(s.request).toHaveBeenCalledTimes(1);
  });

  it("reschedules from a newer manual sync timestamp and ignores stale refresh props", async () => {
    const s = setup(new Date().toISOString());
    await vi.advanceTimersByTimeAsync(240_000);
    s.controller.updateLastSyncedAt(new Date().toISOString());
    s.controller.updateLastSyncedAt("2026-10-28T00:00:00Z");
    await vi.advanceTimersByTimeAsync(299_999);
    expect(s.request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.request).toHaveBeenCalledTimes(1);
    s.controller.updateLastSyncedAt("2026-10-28T00:00:00Z");
    await vi.advanceTimersByTimeAsync(299_999);
    expect(s.request).toHaveBeenCalledTimes(1);
  });

  it("aborts pending work and removes listeners and timers when stopped", async () => {
    const s = setup(new Date().toISOString());
    let finish!: (response: Response) => void;
    s.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(300_000);
    expect(s.request).toHaveBeenCalledTimes(1);
    const signal = s.request.mock.calls[0][1]!.signal!;
    s.controller.stop();
    expect(signal.aborted).toBe(true);
    finish(Response.json({ matched: 1 }));
    s.events.dispatchEvent(new Event("focus"));
    s.events.dispatchEvent(new Event("online"));
    s.page.setVisible(true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(s.request).toHaveBeenCalledTimes(1);
    expect(s.onSuccess).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
