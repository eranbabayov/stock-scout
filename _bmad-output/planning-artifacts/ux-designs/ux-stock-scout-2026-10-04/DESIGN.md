---
name: Stock Scout
description: Personal stock watchlist/charting/alerting web app. React + shadcn/ui on Vite + Tailwind; dark pro-dense-clean trading-terminal register. This DESIGN.md specifies the brand-layer delta over shadcn defaults and over the app's existing light theme.
status: draft
updated: 2026-10-04
colors:
  # Dark-mode brand overrides. All unlisted tokens (card, popover, input, ring,
  # secondary, sidebar-*) inherit shadcn's standard dark-mode derivation from
  # these base values — see Colors section for which ones are hand-set.
  background: '#06080C'
  foreground: '#D7DCE3'
  card: '#10141B'
  card-foreground: '#D7DCE3'
  border: '#232833'
  muted: '#15181D'
  muted-foreground: '#6E7684'
  muted-dim: '#4B5563'
  primary: '#3DDC97'
  primary-foreground: '#06080C'
  destructive: '#EF5350'
  destructive-foreground: '#06080C'
  stock-up: '#26A69A'
  stock-down: '#EF5350'
  stock-neutral: '#6E7684'
  alert-pending: '#FFB800'
  alert-pending-bg: '#4A3B0E'
  alert-fired: '#3DDC97'
  alert-fired-bg: '#0F2A1E'
  alert-fired-border: '#1F6B49'
  chart-grid: '#1C2128'
  chart-surface: '#0D1117'
typography:
  # Body/label/caption inherit shadcn's Inter ramp, already in use
  # (src/index.css). Numeric display role is new: monospace for anything
  # that is a price, percent, quantity, or timestamp.
  numeric:
    fontFamily: 'JetBrains Mono'
    fontWeight: '600'
  numeric-lg:
    fontFamily: 'JetBrains Mono'
    fontSize: 28px
    fontWeight: '700'
    letterSpacing: -0.01em
rounded:
  # Unchanged from shadcn/existing app default — carried forward, not a
  # delta. Listed for completeness since components reference it.
  DEFAULT: 0.75rem
  sm: 0.5rem
  md: 0.75rem
  lg: 1rem
  full: 9999px
spacing:
  # Tailwind default scale inherited; no overrides.
components:
  alert-marker-pending:
    line-color: '{colors.alert-pending}'
    line-style: 'dashed'
    tag-background: '{colors.alert-pending-bg}'
    tag-foreground: '{colors.alert-pending}'
  alert-marker-fired:
    line-color: '{colors.alert-fired}'
    line-style: 'solid'
    tag-background: '{colors.alert-fired-bg}'
    tag-foreground: '{colors.alert-fired}'
  current-price-marker:
    line-color: '{colors.primary}'
    tag-background: '{colors.primary}'
    tag-foreground: '{colors.primary-foreground}'
  alert-row-fired:
    background: '{colors.alert-fired-bg}'
    border: '{colors.alert-fired-border}'
    accent-text: '{colors.alert-fired}'
  alert-row-pending:
    background: '{colors.muted}'
    border: '{colors.border}'
  stock-card:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
---

## Brand & Style

Stock Scout is a personal trading terminal, not a consumer fintech app — the north star is "simple and user-friendly enough to enjoy," but the chosen register is still pro-dense: dark terminal surfaces, monospace numerics, teal-up/red-down candle convention. The brand expression is restraint on top of density — the raw pro-dense mockup's ticker-tape marquee and four-cell stat grid are dropped per decision; what stays is the dark palette, the monospace numeric voice, and the teal/amber/red color vocabulary that lets price state be read in a half-second glance.

Stock Scout inherits shadcn/ui's component contract wholesale (`Button`, `Card`, `Dialog`, `Tabs`, `Select`, `Tooltip`, `AlertDialog` all unchanged in behavior). This DESIGN.md specifies the dark-mode color re-skin, the monospace numeric type role, and the new alert-marker components the chart needs to show a target price alongside the live price. The existing light theme (`src/index.css` `:root` block) is retained, not replaced: the user gets an explicit light/dark toggle, dark is simply the new default. Every color token above is the dark-mode value; the light-mode value for each already exists in `src/index.css` and is unchanged by this work.

## Colors

- **Background `{colors.background}` (`#06080C`)** — page background. Near-black, not pure black — avoids the "turned-off OLED" look while staying terminal-dark.
- **Card `{colors.card}` (`#10141B`)** — panel surfaces: watchlist sidebar, dialogs, stat cards, chart chrome. One step up from background, not a separate "elevated" tone — see Elevation.
- **Foreground `{colors.foreground}` (`#D7DCE3`)** / **Muted-foreground `{colors.muted-foreground}` (`#6E7684`)** / **Muted-dim `{colors.muted-dim}` (`#4B5563`)** — three-step text hierarchy: primary reading text, secondary labels (table headers, timestamps), and tertiary chrome (dividers' adjacent micro-labels). Replaces the light theme's single muted-foreground step — pro-dense needs the extra step because so much of the surface is numeric labels at different importance.
- **Primary `{colors.primary}` (`#3DDC97`)** — the "live/current" color. Used for the current-price line and tag on the chart, primary buttons, and active nav/list-tab state. This is a new primary distinct from the existing light theme's green (`142 60% 40%`) — picked to double as "this is live right now," matching the mockup's current-price green.
- **Stock-up `{colors.stock-up}` (`#26A69A`)** / **Stock-down `{colors.stock-down}` (`#EF5350`)** — candle and price-change convention. Deliberately a different teal than `{colors.primary}` — up-candles and "current price" need to stay visually distinct even though both read as "green-ish," because a candle can be up while the live price marker sits elsewhere relative to an alert line.
- **Alert-pending `{colors.alert-pending}` (`#FFB800`)** / **Alert-pending-bg `{colors.alert-pending-bg}` (`#4A3B0E`)** — amber. Exclusively for an alert target that has not yet fired: the dashed line/tag on the chart, and the pending row background in the alerts list. Never used for anything else — amber means "target, not yet crossed."
- **Alert-fired `{colors.alert-fired}` (`#3DDC97`)** / **Alert-fired-bg `{colors.alert-fired-bg}` (`#0F2A1E`)** / **Alert-fired-border `{colors.alert-fired-border}` (`#1F6B49`)** — reuses the primary green on purpose: a fired alert's target line becomes indistinguishable in color from "where the price is/was," because that's the point — the climax beat is price-crossed-target, so fired state visually merges the two.
- **Destructive `{colors.destructive}` (`#EF5350`)** — reused from `{colors.stock-down}`; one red in the system, not two.
- **Chart-grid `{colors.chart-grid}` (`#1C2128`)** / **Chart-surface `{colors.chart-surface}` (`#0D1117`)** — chart-specific background and gridline tone, one step darker than `{colors.card}` so the chart reads as a distinct instrument panel inside its card chrome.

Avoid: introducing a second blue/purple accent (the mockup's multi-chart-series palette is out of scope — this app overlays MA lines using the existing `--chart-1..5` tokens, unchanged); using `{colors.alert-pending}` for anything that isn't an unfired target; using pure `#000000` anywhere (background is `#06080C`, never true black).

## Typography

Body, label, and heading roles inherit the existing Inter ramp (`src/index.css`) unchanged — no new display role is introduced; the decision record scopes this to palette + density, not a type-system overhaul. The one addition is a semantic rule, not a new font: **any numeric value that represents a live or historical market fact (price, percent change, quantity, volume, OHLC, timestamp) renders in `{typography.numeric}` (JetBrains Mono)** — this is already partially true today (`.font-mono` exists in `src/index.css`); this redesign makes it a universal rule rather than an ad hoc class, applied consistently across the chart header, watchlist rows, trades table/cards, and alert rows. `{typography.numeric-lg}` is reserved for the single largest price on a screen — the chart header's current price.

## Layout & Spacing

Tailwind default spacing scale inherited as-is, no overrides. Existing `container mx-auto` + `flex flex-col lg:flex-row` dashboard shell (`src/pages/DashboardPage.tsx`) is retained structurally; this redesign is a re-skin plus the responsive sidebar/table adaptations in EXPERIENCE.md, not a grid rebuild. Breakpoint convention stays Tailwind's `lg` (1024px) as the phone/laptop split, matching the existing `lg:` usage in `WatchlistSidebar` and `DashboardPage`.

## Elevation & Depth

Pro-dense-clean uses tonal layering, not shadows: `{colors.background}` → `{colors.card}` → `{colors.chart-surface}`/`{colors.muted}` is a ladder of near-black steps, each one lighter, rather than drop shadows implying physical elevation. [ASSUMPTION] Retain shadcn's default shadow-on-hover for interactive elements (buttons, dropdown menus) since the decision record doesn't call out elevation as a target of the "clean" trim — only the marquee and stat-grid were explicitly dropped.

## Shapes

`{rounded.DEFAULT}` (0.75rem) carried forward unchanged from the existing app (`--radius: 0.75rem` in `src/index.css`) — the decision record's "clean" direction trims density, not geometry. Chart-internal elements (gridlines, candle bodies, alert/current-price tags) use sharp or near-sharp corners regardless of `{rounded}` — a trading chart's internal marks read as instrument-panel ticks, not card UI.

## Components

Inherited from shadcn as-is, re-skinned only via the color token overrides above (no structural/behavioral change): `Button`, `Card`, `Dialog`, `AlertDialog`, `Tabs`, `Select`, `Tooltip`, `Input`, `Label`.

New/brand-specific components:

- **Alert marker — pending (`alert-marker-pending`)** — chart overlay element, drawn in the same SVG overlay system that already renders user trendlines/rays (`StockChart.tsx`). A horizontal dashed line at the alert's target price plus a right-aligned tag showing the target value, in `{colors.alert-pending}` / `{colors.alert-pending-bg}`, `{typography.numeric}`. Exists for every active (`status: "active"`) alert on the symbol currently charted.
- **Alert marker — fired (`alert-marker-fired`)** — same anatomy, solid line instead of dashed, `{colors.alert-fired}` / `{colors.alert-fired-bg}` / `{colors.alert-fired-border}`. Renders for `status: "triggered"` alerts — stays visible on the chart after firing (alerts are one-shot per CLAUDE.md, never re-fire, so this marks "this already happened here").
- **Current-price marker (`current-price-marker`)** — a horizontal solid line at the live price (already partially implied by the chart's last-candle position, but made explicit as its own line + tag per the mockup) in `{colors.primary}`, `{typography.numeric}`. Always present whenever a chart is open; this is the second half of the "current vs target at a glance" pairing with the alert markers.
- **Alert row — fired / pending (`alert-row-fired`, `alert-row-pending`)** — list-row backgrounds for `AlertsPanel.tsx`, replacing the current plain `border-b` row styling. Fired rows get `{colors.alert-fired-bg}` background + `{colors.alert-fired-border}`; pending rows get `{colors.muted}` + `{colors.border}`. Each row additionally shows an inline current-vs-target comparison (two `{typography.numeric}` values side by side) rather than today's descriptive sentence-only row (`describeAlert()` in `AlertsPanel.tsx`) — see EXPERIENCE.md Component Patterns.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use `{typography.numeric}` for every price/percent/quantity/timestamp, everywhere | Set market data in the default Inter body font |
| Use `{colors.alert-pending}` only for an unfired target | Use amber for warnings, destructive actions, or anything else |
| Keep `{colors.alert-fired}` visually equal to `{colors.primary}` (both green) | Introduce a third color to distinguish "fired" from "current price" — the overlap is deliberate |
| Re-skin shadcn components via color tokens only | Restructure shadcn component anatomy (Dialog layout, Button padding, etc.) |
| One alert marker per active/triggered alert on the charted symbol | Reintroduce the ticker-tape marquee or the 4-cell OHLC stat grid from the raw pro-dense mockup — both explicitly dropped |
| Near-black (`#06080C`) backgrounds | Pure black (`#000000`) anywhere |
