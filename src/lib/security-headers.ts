/**
 * Security headers sent with every response (wired up in next.config.ts).
 *
 * The CSP is deliberately pragmatic: Next inlines the scripts that bootstrap and hydrate each page, and the
 * next-themes script and Recharts/Tailwind styles are inline too, so script-src and style-src keep 'unsafe-inline'.
 * Moving to nonces would force every page to render dynamically per request and defeat Next's static output.
 * Everything else is locked to the app's own origin, because the app loads nothing third-party in the browser:
 * fonts come from next/font (self-hosted at build time), the activity route is an inline SVG with no map tiles,
 * the service worker only fetches same-origin, and the Intervals.icu and Resend calls happen on the server.
 *
 * Deliberately not set:
 * - form-action: the OAuth consent flow and Google sign-in end in a redirect to another origin, and Chrome applies
 *   form-action to redirects that follow a form submission.
 * - upgrade-insecure-requests: it would break previewing a production build over http://localhost.
 */
export function contentSecurityPolicy(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // React's dev build uses eval to rebuild server stack traces in the browser
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export function securityHeaders(isDev: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Older browsers ignore CSP frame-ancestors
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Nothing in the app uses these; clipboard-write (the MCP URL copy button) is left at its default
    {
      key: "Permissions-Policy",
      value: ["camera", "microphone", "geolocation", "payment", "usb", "bluetooth", "serial", "midi", "magnetometer", "gyroscope", "accelerometer", "interest-cohort"]
        .map((feature) => `${feature}=()`)
        .join(", "),
    },
    // Browsers ignore this over plain http, so it only takes effect on the deployed https site
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
  ];
}
