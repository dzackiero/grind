/**
 * Keeps DESIGN.md and src/app/globals.css in step. Checks that every colour in DESIGN.md's front matter matches the
 * dark theme (falling back to :root for tokens the dark theme doesn't override), and that the light-theme table in
 * the Colors section matches :root. Run with `pnpm design:check`.
 */
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** DESIGN.md token name -> CSS variable, where they differ. */
const CSS_NAME: Record<string, string> = { subtle: "ink-subtle" };

function cssBlock(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`globals.css has no ${selector} block`);
  const end = css.indexOf("\n}", start);
  const vars = new Map<string, string>();
  for (const [, name, value] of css
    .slice(start, end)
    .matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    vars.set(name, value.toLowerCase());
  }
  return vars;
}

function frontMatterColors(md: string): Map<string, string> {
  const front = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "";
  const block = /^colors:\n((?: {2}.*\n?)+)/m.exec(front)?.[1] ?? "";
  const colors = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/^ {2}([\w-]+):\s*"(#[0-9a-fA-F]{3,8})"/gm)) {
    colors.set(name, value.toLowerCase());
  }
  return colors;
}

/** Rows like `| \`background\` | \`#f3f4ef\` | \`accent-ink\` | \`#4c6a00\` |`: token and value cells in pairs. */
function lightTable(md: string): Map<string, string> {
  const section = /### Light theme([\s\S]*?)\n##/.exec(md)?.[1] ?? "";
  const light = new Map<string, string>();
  for (const [, name, value] of section.matchAll(/`([\w-]+)`\s*\|\s*`(#[0-9a-fA-F]{3,8})`/g)) {
    light.set(name, value.toLowerCase());
  }
  return light;
}

const css = read("src/app/globals.css");
const md = read("DESIGN.md");
const root = cssBlock(css, ":root");
const dark = new Map([...root, ...cssBlock(css, ".dark")]);

const errors: string[] = [];
const compare = (theme: string, token: string, expected: string, actual: Map<string, string>) => {
  const variable = CSS_NAME[token] ?? token;
  const found = actual.get(variable);
  if (found === undefined)
    errors.push(`${theme}: DESIGN.md has "${token}" but globals.css has no --${variable}`);
  else if (found !== expected)
    errors.push(`${theme}: ${token} is ${expected} in DESIGN.md but ${found} in globals.css`);
};

const colors = frontMatterColors(md);
if (colors.size === 0) errors.push("DESIGN.md front matter has no colors");
for (const [token, value] of colors) compare("dark", token, value, dark);

const light = lightTable(md);
if (light.size === 0) errors.push("DESIGN.md has no light-theme table");
for (const [token, value] of light) compare("light", token, value, root);

if (errors.length > 0) {
  console.error(`DESIGN.md and globals.css disagree:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `DESIGN.md matches globals.css (${colors.size} dark tokens, ${light.size} light overrides).`,
);
