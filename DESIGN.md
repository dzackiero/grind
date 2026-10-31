---
version: alpha
name: Grind
description: One training plan for running and strength. Dark first, lime accent, big honest numbers.
colors:
  # Dark theme, the default. Light values are in the Colors section. Names match the CSS variables in
  # src/app/globals.css (`colors.card` is `--card`), and `pnpm design:check` enforces that.
  background: "#0d0f0c"
  foreground: "#f0f2eb"
  card: "#171a16"
  card-foreground: "#f0f2eb"
  primary: "#c8f135"
  primary-foreground: "#121410"
  secondary: "#22261f"
  secondary-foreground: "#f0f2eb"
  muted: "#22261f"
  muted-foreground: "#a7ad9f"
  accent: "#22261f"
  accent-foreground: "#f0f2eb"
  subtle: "#8b9185"
  border: "#2c3129"
  line-strong: "#4a5244"
  input: "#4a5244"
  ring: "#c8f135"
  accent-ink: "#c8f135"
  accent-soft: "#263011"
  destructive: "#ff6b6b"
  success: "#5ed28c"
  warning: "#ffc23d"
  on-type: "#10120e"
  type-easy: "#5ed28c"
  type-tempo: "#ffc23d"
  type-intervals: "#ff7a45"
  type-hills: "#d69a62"
  type-long: "#b49cff"
  type-race: "#ff5c7a"
  type-strength: "#6eb6ff"
  plate-red: "#e0393e"
  plate-blue: "#2f6fdb"
  plate-yellow: "#f2c230"
  plate-green: "#22914a"
  plate-white: "#e6e8e3"
  tier-bronze: "#c98a55"
  tier-silver: "#bcc3cb"
  tier-gold: "#e8bf45"
  tier-platinum: "#bfe3de"
typography:
  stat-xl:
    fontFamily: Archivo
    fontSize: 1.875rem
    fontWeight: 800
    lineHeight: 2.25rem
    fontFeature: tnum
  stat:
    fontFamily: Archivo
    fontSize: 1.5rem
    fontWeight: 800
    lineHeight: 2rem
    fontFeature: tnum
  title:
    fontFamily: Archivo
    fontSize: 1.125rem
    fontWeight: 800
    lineHeight: 1.5rem
  body:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25rem
  body-strong:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1.25rem
  label:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 0.875rem
    letterSpacing: 0.05em
  data:
    fontFamily: Geist Mono
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25rem
rounded:
  sm: 10px
  md: 12px
  lg: 16px
  xl: 20px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 20px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 20px
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.background}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 20px
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: 20px
  card-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: 20px
  badge:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 8px
  tab-bar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.subtle}"
    typography: "{typography.label}"
    height: 64px
  tab-bar-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    height: 32px
    width: 56px
  type-tag:
    backgroundColor: "{colors.type-easy}"
    textColor: "{colors.on-type}"
    rounded: "{rounded.sm}"
    size: 14px
---

## Overview

Grind is one training plan for running and strength. The plan is the hero: every screen answers "what do I do today, and am I on track?" before anything else. The athlete stays in control, so anything Claude proposes shows up as a reviewable card, never as a silent change.

- **Running and strength are equals.** They share one calendar, one week progress bar and one points system.
- **Numbers are big and honest.** Show what the watch recorded next to what was planned. No fake precision.
- **Rewards follow training, not tapping.** Points come from completed, on-target workouts and weekly consistency.
- **Dark first, light supported.** Training happens early and late. Both themes use the same token names, and components never hard-code a colour.

The brand mark is a lime disc with teeth on its rim and a hole in the middle: the burr of a coffee grinder, which is also a weight plate. Grind is one of the CUP (Coffee Unite People) apps. The loader ratchets one tooth at a time (`brand-loader.tsx`).

### Voice

Write like a calm coach standing next to the athlete at the track.

- Short, direct sentences: "Easy pace. You should be able to talk."
- Use the athlete's words (_long run_, _rest_, _reps_), never internal ones (_activity entity_, _sync job_).
- Give the reason with the instruction: "Moved intervals to Thursday because your HRV is low."
- Buttons say what happens: **Start plan**, **Log workout**, **Accept changes**.
- Units: km, min/km, kg, bpm. Paces as `4:10/km`, durations as `48 min` or `1:52 h`, rest as `90"`.
- No emoji in the UI.

## Colors

Use the semantic role, not the hex. In code that means Tailwind utilities generated from the CSS variables (`bg-card`, `text-muted-foreground`, `border-line-strong`), never raw colours.

- **Primary (`#c8f135`, lime):** the brand. A fill for the one main action, progress, today's date and the active tab. Text on it is always `primary-foreground`.
- **Accent ink (`accent-ink`):** lime used as text or an icon on a surface, such as links and "on target" ticks. It darkens in the light theme to keep contrast. Never use `primary` as text colour.
- **Accent (`accent`) is not lime.** It is the neutral hover and selected surface from shadcn. Lime is `primary`.
- **Accent soft (`accent-soft`):** tinted background for coach suggestions and highlighted rows (Card `tone="accent"`). Text on it is `foreground`.
- **Neutrals** lean slightly olive so the lime feels at home. `background` sits behind `card`; `secondary` and `muted` are wells inside a card, such as step rows, inputs and empty progress segments.
- **Text:** `foreground` for primary text and big numbers, `muted-foreground` for secondary text (dates, units), `subtle` for uppercase labels, axis labels and inactive tabs.
- **Lines:** `border` is the hairline between rows and days. `line-strong` is the current card's outline and control borders (3:1 against `card`).
- **Outcomes:** `success` (completed, on target), `warning` (slightly off target, missed but movable), `destructive` (errors, destructive actions, plan check failures). They only describe outcomes, never decorate.

### Workout colours

Workout colours are information, not decoration. Each type has a **fill** token (`type-*`, for tiles and tag squares) and a **mark** token (`type-*-mark`, for dots, bars and small text on `background` or `card`). Text on any fill is `on-type`. The type to class mapping lives in `src/components/kilo/workout-types.ts`. Add a new type there and in `globals.css`, nowhere else.

| Type      | Token            | Used for               |
| --------- | ---------------- | ---------------------- |
| Easy      | `type-easy`      | Easy and recovery runs |
| Tempo     | `type-tempo`     | Threshold and tempo    |
| Intervals | `type-intervals` | Speed work, repeats    |
| Hills     | `type-hills`     | Hill repeats           |
| Long run  | `type-long`      | Weekly long run        |
| Race      | `type-race`      | Race day, time trials  |
| Strength  | `type-strength`  | All strength sessions  |

A type colour is never the only signal: a coloured tag always sits next to the type name.

### Plates and tiers

Personal records are weight plates coloured like competition bumper plates: 5K green, 10K yellow, half marathon blue, marathon red, short distances white. Every plate has a `plate-rim` outline so light plates read on light backgrounds. Points climb Bronze, Silver, Gold, Platinum, then Lime, and the top tier is `primary` itself.

### Light theme

The front matter holds the dark palette because dark is the default. Where a value differs in the light theme:

| Token              | Light     | Token         | Light     |
| ------------------ | --------- | ------------- | --------- |
| `background`       | `#f3f4ef` | `accent-ink`  | `#4c6a00` |
| `foreground`       | `#121410` | `accent-soft` | `#edf8c6` |
| `card`             | `#ffffff` | `destructive` | `#c42b2b` |
| `card-foreground`  | `#121410` | `success`     | `#1b8a4b` |
| `secondary`        | `#eef0e9` | `warning`     | `#9a6700` |
| `muted`            | `#eef0e9` | `ring`        | `#4c6a00` |
| `muted-foreground` | `#565c51` | `input`       | `#9aa08f` |
| `accent`           | `#eef0e9` | `line-strong` | `#9aa08f` |
| `subtle`           | `#646a5e` | `border`      | `#dcdfd5` |

`primary`, `primary-foreground`, `on-type`, the `type-*` fills and the `plate-*` and `tier-*` colours are the same in both themes. The `type-*-mark` colours darken in the light theme so they read on a light background (for example `type-tempo-mark` is `#a06c00`); see `globals.css` for those.

## Typography

- **Archivo** (`font-display`, slightly expanded) for numbers, workout names and titles, always extra bold with tabular numerals.
- **Geist** (`font-sans`) for body text, labels and buttons.
- **Geist Mono** (`font-mono`) for paces, splits, sets × reps and rest.
- Uppercase labels use the `kilo-label` utility: `subtle`, 12px, semibold, wide tracking. They sit above a big number.
- Use at most one `stat-xl` number per screen. Real code uses `text-3xl` for it and `text-2xl` for `stat`.

## Layout

- **Mobile first** at 375–430px. The signed-in shell is `max-w-md` with a 16px (`px-4`) gutter; from `lg` it widens to `max-w-7xl` with a 32px gutter, and the same cards flow into columns. Use `appShellClassName` from `src/lib/app-shell.ts` and don't re-derive these widths.
- **Spacing:** 4px between an icon and its label, 8px inside chips, 12px between list rows, 16px for gutters, 20px card padding, 24px between cards, 32px between screen sections. Use Tailwind's scale: `gap-1`, `gap-2`, `gap-3`, `gap-4`, `p-5`, `gap-6`, `gap-8`.
- **Navigation:** a bottom tab bar with four tabs: Today, Plan, Calendar, Progress. Each tab fills a quarter of the bar and its full height, well past the 44px thumb minimum. Keep the bar clear of the home indicator with `pb-safe`.
- **Touch targets** are at least 44px. The default button and icon button are `h-11` and `size-11`.

## Elevation & Depth

Cards are flat. Separation comes from the gap between cards and from the step from `background` to `card`, not from shadows. Don't add shadows to cards. The current or selected card gets a `line-strong` outline (Card `tone="outline"`).

## Shapes

`--radius` is `1rem` and the scale derives from it: `rounded-sm` 10px, `rounded-md` 12px, `rounded-lg` 16px, `rounded-xl` 20px. Use `rounded-xl` for cards and sheets, `rounded-md` for rows, tiles and inputs, `rounded-sm` for workout tag squares, and `rounded-full` for buttons, badges and the active tab pill. Icons are Lucide outline icons, `currentColor`, 1.75 stroke, 20–22px in navigation and 16px in buttons.

## Components

Build from `src/components/ui` (shadcn) and `src/components/kilo` (app components), and pick variants instead of restyling at the call site. If no variant fits, add one to the component with `cva`; `@shadcn/lint` rules are errors.

- **Button** (`ui/button.tsx`): `variant` default (lime, the one main action per screen), `secondary`, `outline`, `ghost`, `link`, `destructive`, `ghost-destructive`. `size` default (44px), `sm`, `lg`, `xs`, and `icon*`. Layout via `justify` and `width` props, not classes.
- **Card** (`ui/card.tsx`): `tone` default, `outline` (current or selected) or `accent` (coach suggestion); `spacing` default or `flush` (rows run edge to edge); `dimmed` for finished items.
- **Badge** (`ui/badge.tsx`): `default`, `secondary`, `accent`, `outline`, `destructive`. Short status words only.
- **TypeTag / TypeDot** (`kilo/type-tag.tsx`): 14px square or 6px dot for a workout type. Dots use the `-mark` colour.
- **Stat** (`kilo/stat.tsx`): uppercase label over a big Archivo number with an optional unit and hint.
- **WorkoutCard, WeekCard, WeekStrip, StepList, TierCard, PlateBadge, PlanChangeCard, TabBar:** the plan and progress surfaces in `src/components/kilo`. Read the existing one before making a similar thing.
- **PlanChangeCard** is how a coach proposal appears: a one-line reason, the data it used (HRV, last week's km, a missed session), and **Accept changes** or keep the plan. Never apply a plan change without it.

## Do's and Don'ts

- Do use semantic tokens (`bg-card`, `text-muted-foreground`). Don't use hex values, `bg-[#…]`, or Tailwind palette colours (`bg-lime-400`, `text-gray-500`) in components.
- Do pair every `type-*` fill with `on-type` text. Don't use a `-mark` colour as a fill for a big surface.
- Do use `primary` for exactly one main action per screen. Don't use lime as body text; use `accent-ink`.
- Do keep numbers in `font-display` with tabular numerals. Don't use Archivo for body copy.
- Do show planned and recorded values together. Don't invent precision the watch didn't record.
- Do meet 4.5:1 for text and 3:1 for control borders in both themes. Don't rely on colour alone to carry meaning.
- Do respect `prefers-reduced-motion`; progress fills and the brand loader animate only when motion is allowed.
- Don't add shadows to cards, and don't add colours, radii or type sizes that aren't listed here. Propose the token first, then add it to `globals.css` and this file together.
- Don't put emoji in the UI.

## Design in pen.dev

`design/grind.pen` is the same system for designers and agents working in [pen.dev](https://www.pen.dev). It has a `mode` theme (Dark is the default, Light overrides) and variables named after the tokens above: colours (including the `type-*-mark`, `plate-*` and `tier-*` ones), `radius-*`, `spacing-*` and the type scale. Components (Button, Card, Badge, TypeTag, TypeDot, Stat, TabBar) bind every fill, text colour and radius to those variables. The Documentation frames show both themes.

`.pen` files are encrypted, so open and edit them only through pen.dev or its MCP server. When the file and this one disagree, this file wins; fix the `.pen` file to match. `pnpm design:check` does not compare the two.

## Changing the system

1. Edit `src/app/globals.css` (both `:root` and `.dark`) and this file in the same change.
2. Run `pnpm design:check`. It fails if a token here is missing from or differs from `globals.css`, or if the light table is out of date.
3. Run `pnpm design:lint` for the DESIGN.md spec rules (broken references, WCAG contrast of component pairs).
