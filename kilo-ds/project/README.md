# Kilo

Kilo is a training app for hybrid athletes: one plan for running and strength, built on data synced from intervals.icu, with Claude as an optional coach through an MCP connector. The name covers both halves: kilometers and kilograms.

This system is the single source for every screen. Build with the tokens and `k-` component classes here; do not introduce new colours, radii or type sizes.

## Product principles

- **The plan is the hero.** Every screen answers "what do I do today, and am I on track?" before anything else.
- **Running and strength are equals.** They share one calendar, one week progress bar, one points system.
- **Numbers are big and honest.** Show what the watch recorded, next to what was planned. No fake precision.
- **Rewards follow training, not tapping.** Points come from completed, on-target workouts and weekly consistency.

## Voice

Write like a calm coach standing next to you at the track.

- Short, direct sentences. "Easy pace. You should be able to talk."
- Name things by what the athlete knows: *long run*, *rest*, *reps*, never *activity entity* or *sync job*.
- Give the reason with the instruction: "Moved intervals to Thursday because your HRV is low."
- Buttons say what happens: **Start plan**, **Log workout**, **Accept changes**.
- Units: km, min/km, kg, bpm. Paces as `4:10/km`, durations as `48 min` or `1:52 h`, rest as `90"`.

## Visual foundations

**Dark first, light supported.** The dark theme is the default (training happens early and late). Both themes use the same tokens; components never hard-code a colour.

**Neutrals** (`bg`, `surface`, `surface-raised`, `line`, `ink`…) lean slightly olive so the lime feels at home. Cards are flat `surface` blocks with `radius-lg`; separation comes from the gap between cards (`space-6`), not shadows. Only the floating Log workout button and bottom sheets use `shadow-float`.

**Lime** (`accent`) is the brand. Use it as a fill for the one main action, progress, today's date and the active tab. When lime has to be text or an icon on a surface, use `accent-ink`, which darkens in the light theme. Text on lime is always `on-accent`.

**Workout colours** are information, not decoration. Each type has a fill token for tiles and chips and a `-mark` token for dots and small marks:

| Type | Fill | Used for |
|---|---|---|
| Easy | `type-easy` | Easy and recovery runs |
| Tempo | `type-tempo` | Threshold and tempo |
| Intervals | `type-intervals` | Speed work, repeats |
| Hills | `type-hills` | Hill repeats |
| Long run | `type-long` | Weekly long run |
| Race | `type-race` | Race day, time trials |
| Strength | `type-strength` | Legs & Core, Upper Body, Full Body |
| Mobility | `type-recovery` | Mobility, yoga |

Text on any type fill is `on-type`. Semantic colours (`success`, `warning`, `danger`) are separate and only describe outcomes.

**Plates.** Personal records are weight plates coloured like competition bumper plates: 5K green, 10K yellow, half marathon blue, marathon red, short distances white. See PlateBadge.

**Tiers.** Points climb Bronze → Silver → Gold → Platinum → Lime. The top tier is the brand colour.

## Typography

- **Archivo** (display, slightly expanded) for numbers, workout names and titles. Numbers always use tabular numerals.
- **Geist** for body text, labels and buttons.
- **Geist Mono** for paces, splits, sets × reps and rest.

Uppercase labels (`label` style) sit above big numbers in `ink-subtle` with 0.08em tracking. One `stat-xl` number per screen at most.

## Layout

- Mobile first at 375–430px wide, 16px side gutter (`space-4`), cards stacked with `space-6` between.
- Bottom tab bar: Today, Plan, Calendar, Progress, Coach.
- Today: week strip header, today's workout card, week overview, insights, tier progress, quick-add tiles, floating Log workout button.
- On desktop, the same cards flow into two columns with the week strip as a top bar; no new components.

## Iconography

Lucide-style outline icons, 1.75 stroke, rounded caps, 22px in navigation and 18px in buttons. Icons take `currentColor`. No emoji in the UI. The coach is marked with a four-point sparkle.

## Coach (Claude via MCP)

Plans are built by Kilo's engine and shaped by Claude. Any change Claude makes appears as a PlanChange card with a one-line reason, and the athlete accepts or keeps their plan. Coach copy follows the voice above and always cites the data it used (HRV, last week's km, a missed session).

## Accessibility

- Text meets 4.5:1 on its surface in both themes; marks and control borders meet 3:1.
- Type colours are never the only signal: every coloured tag sits next to its type name.
- Focus ring: 2px `focus` with 2px offset. Respect reduced motion; progress fills animate only when motion is allowed.
