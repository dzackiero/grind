# Install as an app

Grind includes a web app manifest, home-screen icons, and an install section in **Settings**. Chrome and Edge offer an install button when eligible; on iPhone and iPad, use Safari → Share → Add to Home Screen.

The service worker runs in production only, over HTTPS (or localhost). It caches static assets and a public offline page. Plans, signed-in pages, and API responses always use the network; viewing or editing training offline is not supported.

To check locally, run `pnpm build` followed by `pnpm start`. In browser DevTools, check Application → Manifest and Service Workers, open Settings to try installation, then enable offline mode and reload a page to check the fallback. Disable offline mode and use **Try again** to return. Mobile home-screen installation still needs a check on a real iOS or Android device.

Worker changes keep the `/sw.js` URL and revalidate on registration. Bump `VERSION` in `public/sw.js` when replacing precached content; activation removes obsolete Grind caches.
