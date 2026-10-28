// Makes the sound effects for promo/grind-story.html and puts them on the video.
//   node promo/make-sfx.mjs     writes promo/out/grind-story-sfx.wav and promo/out/grind-story-sfx.mp4
// The sounds are synthesised here from sine waves and filtered noise, no samples, no packages: a dry, mechanical
// click for each tooth of the burr, soft taps and a few rising notes for the numbers. Every sound is placed at the
// moment its picture happens in the video (times worked out from the render(t) timeline in grind-story.html).
// Needs Node 22+ and ffmpeg on the PATH, and a video from render-story.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "out");
const silent = path.join(outDir, "grind-story.mp4");
const wav = path.join(outDir, "grind-story-sfx.wav");
const withSound = path.join(outDir, "grind-story-sfx.mp4");
if (!existsSync(silent)) throw new Error("Render the video first: node promo/render-story.mjs");
mkdirSync(outDir, { recursive: true });

const SR = 44100;
const DURATION = 15;
const N = SR * DURATION;
const L = new Float32Array(N);
const R = new Float32Array(N);
const cues = [];

/* Noise that is the same every run, so the track is reproducible */
let seed = 20261028;
const noise = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647) * 2 - 1;
};
const decay = (t, tau) => Math.exp(-t / tau) * (1 - Math.exp(-t / 0.0015));
const mix = (ch, i, v) => {
  if (i >= 0 && i < N) ch[i] += v;
};

/** A pitched sound: `fn(t)` gives the sample (with its own envelope); pan runs from -1 (left) to 1 (right). */
function voice(at, dur, label, fn, gain = 1, pan = 0) {
  cues.push({ at, label });
  const start = Math.round(at * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let k = 0, len = Math.round(dur * SR); k < len; k++) {
    const s = fn(k / SR);
    mix(L, start + k, s * gl);
    mix(R, start + k, s * gr);
  }
}

/**
 * Band-passed noise whose centre moves from f0 to f1, with its own noise in each ear so it sounds wide. `shape` is
 * how loud it is over its length (0 to 1) and `pan` where it sits (-1 left to 1 right), both by progress 0 to 1.
 */
function swish(at, dur, label, f0, f1, q, gain, shape = (p) => Math.sin(Math.PI * p) ** 2, pan = () => 0) {
  cues.push({ at, label });
  const start = Math.round(at * SR);
  for (const ch of [L, R]) {
    let low = 0;
    let band = 0;
    for (let k = 0, len = Math.round(dur * SR); k < len; k++) {
      const p = k / len;
      const fc = f0 * Math.pow(f1 / f0, p);
      const f = 2 * Math.sin((Math.PI * fc) / SR);
      const x = noise();
      low += f * band;
      const high = x - low - band / q;
      band += f * high;
      const where = ((pan(p) + 1) * Math.PI) / 4;
      mix(ch, start + k, band * shape(p) * gain * (ch === L ? Math.cos(where) : Math.sin(where)));
    }
  }
}

/**
 * The sound of one scene leaving and the next arriving. Not a symmetrical swell: it jumps in fast and trails away, like
 * air passing, the pitch falls as it goes and it travels across from one ear to the other, then a soft low thump as the
 * next scene lands. `dir` is 1 for left to right, -1 for right to left; each one differs a little so they don't repeat.
 */
function swipe(at, dir, f0, dur, landing) {
  const attack = (p) => Math.min(1, p / 0.12) ** 0.7;
  swish(at, dur, "scene change", f0, 420, 1.1, 0.62, (p) => attack(p) * (1 - p) ** 2.2, (p) => dir * (-0.75 + 1.5 * p));
  if (landing) {
    voice(at + 0.46, 0.35, "scene lands", (t) => Math.sin(2 * Math.PI * (60 * t + 24 * 0.07 * (1 - Math.exp(-t / 0.07)))) * decay(t, 0.07), 0.3);
  }
}

/* The voices */
const thup = (at, gain = 1) => voice(at, 0.4, "thup", (t) => Math.sin(2 * Math.PI * (55 * t + 90 * 0.03 * (1 - Math.exp(-t / 0.03)))) * decay(t, 0.09), gain * 0.9);
const bloop = (at, gain = 1) =>
  voice(at, 0.5, "bloop", (t) => {
    const phase = 2 * Math.PI * (640 * t - 340 * 0.04 * (1 - Math.exp(-t / 0.04)));
    return (Math.sin(phase) + 0.25 * Math.sin(2 * phase)) * decay(t, 0.11);
  }, gain * 0.5);
const click = (at, gain = 1, label = "click") => {
  let prev = 0;
  voice(at, 0.09, label, (t) => {
    const n = noise();
    const hp = n - prev;
    prev = n;
    return hp * decay(t, 0.0035) * 0.55 + Math.sin(2 * Math.PI * 2300 * t) * decay(t, 0.006) * 0.4 + Math.sin(2 * Math.PI * 170 * t) * decay(t, 0.02) * 0.5;
  }, gain * 0.55);
};
/**
 * A short wooden note, like a marimba bar: the pitch, its second octave up (which dies quickly) and a tiny mallet
 * knock. The overtones are whole multiples of the pitch, so it sounds warm and settles at once; a bell's
 * overtones are not, and they ring.
 */
const pluck = (at, hz, gain = 1) =>
  voice(at, 0.5, "pluck", (t) => (Math.sin(2 * Math.PI * hz * t) * decay(t, 0.16) + 0.3 * Math.sin(2 * Math.PI * hz * 4 * t) * decay(t, 0.04) + noise() * decay(t, 0.0025) * 0.18) * 0.85, gain * 0.55);
const tock = (at, gain = 1) => voice(at, 0.15, "tock", (t) => Math.sin(2 * Math.PI * 150 * t) * decay(t, 0.04), gain * 0.35);
const tap = (at, hz, gain = 1, pan = 0, label = "tap") => {
  voice(at, 0.12, label, (t) => Math.sin(2 * Math.PI * hz * t) * decay(t, 0.018) * 0.8 + noise() * decay(t, 0.002) * 0.25, gain * 0.2, pan);
};
const kachunk = (at) => {
  voice(at, 0.5, "ka-chunk", (t) => Math.sin(2 * Math.PI * (48 * t + 62 * 0.1 * (1 - Math.exp(-t / 0.1)))) * decay(t, 0.12), 0.85);
  voice(at + 0.045, 0.1, "chunk click", (t) => (noise() * decay(t, 0.004) + Math.sin(2 * Math.PI * 1400 * t) * decay(t, 0.012)) * 0.5, 0.5);
};

/* The timeline, in seconds. Scene windows: logo 0–2.7, run 2.7–5.9, lift 5.9–9.1, habits 9.1–12.3, end 12.3–15. */

// Logo: the disc pops in, the groove draws, the hole opens, then the teeth click one tooth at a time
thup(0.1);
swish(0.4, 0.6, "groove draws", 700, 4200, 3, 0.3);
bloop(0.88);
swish(0.9, 0.7, "name appears", 220, 900, 1.2, 0.18);
for (const start of [1.2, 2.1]) {
  click(start + 0.03, 1, "tooth click");
  click(start + 0.22, 0.3, "tooth settles");
}
tap(1.55, 880, 0.7, 0, "tagline");

// A swipe as each scene leaves and the next lands (the last one lands on the teeth's click instead of a thump)
swipe(2.4, 1, 3200, 0.6, true);
swipe(5.6, -1, 2800, 0.55, true);
swipe(8.8, 1, 3000, 0.6, true);
swipe(12.0, -1, 2600, 0.65, false);

// Run: the numbers count up, then four bars grow, each a wooden note higher
for (let k = 0; k < 17; k++) tap(3.4 + k * 0.06, 900 + k * 40, 0.55, -0.3, "count");
[523.25, 587.33, 659.25, 783.99].forEach((hz, i) => pluck(3.7 + i * 0.28, hz, 0.7));

// Lift: three sets ticked off, each note higher than the last
[659.25, 783.99, 1046.5].forEach((hz, i) => {
  pluck(6.9 + i * 0.5, hz, 1);
  tock(6.9 + i * 0.5);
});

// Habits: a row of dots fills in per habit, then the streak builds
const COLUMN_HZ = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
[7, 6, 7].forEach((done, row) => {
  for (let j = 0; j < done; j++) tap(9.1 + 0.6 + row * 0.35 + j * 0.1, COLUMN_HZ[j], 0.8, (row - 1) * 0.35, "habit dot");
});
swish(9.9, 0.9, "streak", 300, 1800, 1.2, 0.14);

// End: the mark clicks again and the address lands
for (const start of [12.3, 13.2, 14.1]) {
  click(start + 0.03, 0.9, "tooth click");
  click(start + 0.22, 0.25, "tooth settles");
}
kachunk(13.3);

/* Master: peak at -3 dB, and a short fade at the very end so nothing is cut off */
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const scale = peak > 0 ? 0.708 / peak : 1;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (N - i) / (0.4 * SR));
  L[i] *= scale * fade;
  R[i] *= scale * fade;
}

/* Check: every sound must be heard where it is placed (not lost under another or swallowed by the fade) */
const peakAfter = (at, win = 0.08) => {
  let m = 0;
  for (let i = Math.round(at * SR), end = Math.min(N, i + Math.round(win * SR)); i < end; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  return m;
};
const silentCues = cues.filter((c) => peakAfter(c.at) < 0.01);
if (silentCues.length) throw new Error(`Silent cues: ${silentCues.map((c) => `${c.label}@${c.at}`).join(", ")}`);

/* Write a 16-bit stereo WAV */
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), i * 4);
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(wav, Buffer.concat([header, data]));

/* Put it on the video without re-encoding the picture */
const mux = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", withSound], { stdio: "inherit" });
if (mux.status !== 0) throw new Error("ffmpeg failed");
console.log(`${cues.length} sounds placed, peak scaled by ${scale.toFixed(2)}`);
console.log(`Wrote ${wav}`);
console.log(`Wrote ${withSound}`);
