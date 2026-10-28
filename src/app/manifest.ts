import type { MetadataRoute } from "next";

/** Web app manifest: what the browser needs to offer "Install Kilo" and to open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kilo",
    short_name: "Kilo",
    description: "One training plan for running and strength, with Claude as your coach.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Dark first, like the app itself; the light theme still works inside the app
    background_color: "#0d0f0c",
    theme_color: "#0d0f0c",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", url: "/today", icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }] },
      { name: "Progress", url: "/progress", icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
