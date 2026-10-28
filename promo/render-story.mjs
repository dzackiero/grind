// Renders promo/grind-story.html to an Instagram story video: 1080 x 1920, 15 s, 30 fps, H.264.
// Chrome shows each frame of the page (render(t)) and ffmpeg joins the frames. No packages needed, only Node 22+,
// Chrome or Edge, and ffmpeg on the PATH.
//   node promo/render-story.mjs            writes promo/out/grind-story.mp4 and a few stills
//   node promo/render-story.mjs --quick    only the first second, to try it out
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.join(here, "grind-story.html");
const outDir = path.join(here, "out");
const video = path.join(outDir, "grind-story.mp4");
const quick = process.argv.includes("--quick");
const FPS = 30;
const DURATION = quick ? 1 : 15;
const STILLS = quick ? [] : [0.5, 0.75, 1.0, 1.35, 1.9, 5.3, 8.6, 11.4, 14.2];

const chromePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
if (!chromePath) throw new Error("Chrome or Edge not found");
mkdirSync(outDir, { recursive: true });

const port = 9333;
const profile = mkdtempSync(path.join(tmpdir(), "grind-story-"));
const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1080,1920", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--mute-audio", "about:blank"], { stdio: "ignore" });
const cleanup = () => {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold the folder for a moment; it is a temp folder
  }
};
process.on("exit", cleanup);

async function pageSocket() {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await pageSocket());
await once(ws, "open");
let nextId = 0;
const waiting = new Map();
const events = [];
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method) events.push(msg.method);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  waiting.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${pathToFileURL(html).href}?export=1&t=0` });
for (let i = 0; i < 100 && !events.includes("Page.loadEventFired"); i++) await new Promise((r) => setTimeout(r, 100));

// The fonts come from Google Fonts: wait for them, or the first frames would be drawn in a stand-in font
const fonts = await send("Runtime.evaluate", {
  expression: "Promise.all([document.fonts.load('800 40px Archivo'), document.fonts.load('600 40px Geist'), document.fonts.ready]).then(() => document.fonts.check('800 40px Archivo') && document.fonts.check('600 40px Geist'))",
  awaitPromise: true,
  returnByValue: true,
});
if (!fonts.result.value) console.warn("Warning: the web fonts did not load, so text uses a fallback font.");

const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-shortest", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", video], { stdio: ["pipe", "inherit", "inherit"] });
const ffmpegDone = once(ffmpeg, "close");

const frames = DURATION * FPS;
const stillFrames = new Map(STILLS.map((t) => [Math.round(t * FPS), t]));
for (let i = 0; i < frames; i++) {
  await send("Runtime.evaluate", { expression: `render(${(i / FPS).toFixed(4)})` });
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const png = Buffer.from(shot.data, "base64");
  if (stillFrames.has(i)) writeFileSync(path.join(outDir, `still-${stillFrames.get(i)}s.png`), png);
  if (!ffmpeg.stdin.write(png)) await once(ffmpeg.stdin, "drain");
  if (i % 60 === 0) console.log(`frame ${i}/${frames}`);
}
ffmpeg.stdin.end();
const [code] = await ffmpegDone;
ws.close();
cleanup();
if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
console.log(`Wrote ${video}`);
process.exit(0);
