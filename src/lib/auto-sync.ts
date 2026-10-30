type AutoSyncOptions = {
  document: EventTarget & { readonly visibilityState: string };
  window: EventTarget;
  isOnline: () => boolean;
  lastSyncedAt: string | null;
  onSuccess: (result: { matched: number }) => void;
};

const FRESH_MS = 5 * 60_000;
const RETRY_MS = 60_000;

/** Owns one mounted client's sync timer, request, and foreground/network listeners. */
export function createAutoSync(options: AutoSyncOptions) {
  let lastSuccess = options.lastSyncedAt ? Date.parse(options.lastSyncedAt) : NaN;
  let retryAt = 0;
  let stopped = false;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const active = () =>
    !stopped && options.document.visibilityState === "visible" && options.isOnline();
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const dueAt = () => Math.max(Number.isFinite(lastSuccess) ? lastSuccess + FRESH_MS : 0, retryAt);

  function schedule() {
    clearTimer();
    if (active() && !request) timer = setTimeout(check, Math.max(0, dueAt() - Date.now()));
  }

  async function sync() {
    request = new AbortController();
    try {
      const response = await fetch("/api/intervals/sync", {
        method: "POST",
        signal: request.signal,
      });
      if (!response.ok) throw new Error("Automatic sync failed");
      const result: { matched: number } = await response.json();
      if (stopped) return;
      lastSuccess = Date.now();
      retryAt = 0;
      options.onSuccess(result);
    } catch {
      // Automatic failures stay quiet; settings exposes the server's sync error.
      retryAt = Date.now() + RETRY_MS;
    } finally {
      request = null;
      schedule();
    }
  }

  function check() {
    clearTimer();
    if (!active() || request) return;
    if (Date.now() < dueAt()) schedule();
    else void sync();
  }

  options.document.addEventListener("visibilitychange", check);
  for (const event of ["focus", "online", "offline"]) options.window.addEventListener(event, check);
  check();

  return {
    updateLastSyncedAt(value: string | null) {
      const timestamp = value ? Date.parse(value) : NaN;
      // Refreshed server props may lag behind a just-completed local request.
      if (
        Number.isFinite(timestamp) &&
        (!Number.isFinite(lastSuccess) || timestamp > lastSuccess)
      ) {
        lastSuccess = timestamp;
        retryAt = 0;
        check();
      }
    },
    stop() {
      stopped = true;
      clearTimer();
      request?.abort();
      options.document.removeEventListener("visibilitychange", check);
      for (const event of ["focus", "online", "offline"])
        options.window.removeEventListener(event, check);
    },
  };
}
