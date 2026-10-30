import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("sets every header on all routes, and keeps the service worker headers", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((rule) => rule.source === "/:path*")!;
    const keys = all.headers.map((header) => header.key);
    for (const key of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(keys).toContain(key);
    }
    const sw = rules.find((rule) => rule.source === "/sw.js")!;
    expect(sw.headers.map((header) => header.key)).toEqual(["Content-Type", "Cache-Control", "Service-Worker-Allowed"]);
  });

  it("forbids framing and plugins and keeps everything on our own origin", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/https?:|\*/);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows eval only in development", () => {
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
  });

  it("pairs CSP framing protection with X-Frame-Options", () => {
    const headers = Object.fromEntries(securityHeaders(false).map((h) => [h.key, h.value]));
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });
});
