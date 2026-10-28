import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("public/sw.js", "utf8");

function worker(options: { keys?: string[]; offline?: Response; storageFails?: boolean; storageUnavailable?: boolean; networkFails?: boolean } = {}) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const deleted: string[] = [];
  const stored: string[] = [];
  const cache = {
    match: async () => undefined,
    put: async (request: Request) => {
      if (options.storageFails) throw new Error("Quota exceeded");
      stored.push(request.url);
    },
  };
  runInNewContext(source, {
    URL, Response,
    self: {
      location: { origin: "https://kilo.test" },
      addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; },
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => options.keys ?? [],
      delete: async (key: string) => { deleted.push(key); },
      open: async () => {
        if (options.storageUnavailable) throw new Error("Storage unavailable");
        return cache;
      },
      match: async () => options.offline,
    },
    fetch: async () => {
      if (options.networkFails) throw new Error("Offline");
      return new Response("asset");
    },
  });
  return { handlers, deleted, stored };
}

describe("service worker", () => {
  it("only deletes obsolete Grind caches, including the ones from when the app was called Kilo", async () => {
    const w = worker({ keys: ["kilo-v2-static", "grind-v1-static", "grind-v2-static", "another-app-cache"] });
    let work: Promise<unknown> = Promise.resolve();
    w.handlers.activate({ waitUntil: (promise: Promise<unknown>) => { work = promise; } });
    await work;
    // The current cache (grind-v2-static) stays, and so does anything that isn't ours
    expect(w.deleted).toEqual(["kilo-v2-static", "grind-v1-static"]);
  });

  it("serves a fetched asset even when cache storage is full", async () => {
    const w = worker({ storageFails: true });
    let response: Promise<Response> | undefined;
    const work: Promise<unknown>[] = [];
    w.handlers.fetch({
      request: new Request("https://kilo.test/_next/static/chunk.js"),
      respondWith: (promise: Promise<Response>) => { response = promise; },
      waitUntil: (promise: Promise<unknown>) => { work.push(promise); },
    });
    expect(await (await response)!.text()).toBe("asset");
    await Promise.all(work);
  });

  it("returns an offline response even when the cached fallback is missing", async () => {
    const w = worker({ networkFails: true });
    let response: Promise<Response> | undefined;
    w.handlers.fetch({
      request: { method: "GET", url: "https://kilo.test/today", mode: "navigate" },
      respondWith: (promise: Promise<Response>) => { response = promise; },
    });
    expect((await response)?.status).toBe(503);
  });

  it("uses the precached offline page for failed navigation", async () => {
    const w = worker({ networkFails: true, offline: new Response("offline page") });
    let response: Promise<Response> | undefined;
    w.handlers.fetch({
      request: { method: "GET", url: "https://kilo.test/today", mode: "navigate" },
      respondWith: (promise: Promise<Response>) => { response = promise; },
    });
    expect(await (await response)!.text()).toBe("offline page");
  });

  it("serves network assets when cache storage cannot be opened", async () => {
    const w = worker({ storageUnavailable: true });
    let response: Promise<Response> | undefined;
    w.handlers.fetch({
      request: new Request("https://kilo.test/_next/static/chunk.js"),
      respondWith: (promise: Promise<Response>) => { response = promise; },
    });
    expect(await (await response)!.text()).toBe("asset");
  });

  it("keeps the worker alive until a fetched asset is cached", async () => {
    const w = worker();
    let response: Promise<Response> | undefined;
    const work: Promise<unknown>[] = [];
    w.handlers.fetch({
      request: new Request("https://kilo.test/_next/static/chunk.js"),
      respondWith: (promise: Promise<Response>) => { response = promise; },
      waitUntil: (promise: Promise<unknown>) => { work.push(promise); },
    });
    await response;
    expect(work).toHaveLength(1);
    await Promise.all(work);
    expect(w.stored).toEqual(["https://kilo.test/_next/static/chunk.js"]);
  });

  it.each(["/api/auth/session", "/today?_rsc=abc", "https://other.test/script.js"])("leaves private data and third-party requests alone: %s", (path) => {
    const w = worker();
    let intercepted = false;
    w.handlers.fetch({
      request: new Request(new URL(path, "https://kilo.test")),
      respondWith: () => { intercepted = true; },
    });
    expect(intercepted).toBe(false);
  });
});
