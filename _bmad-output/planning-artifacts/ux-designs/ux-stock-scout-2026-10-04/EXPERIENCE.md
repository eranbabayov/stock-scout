---
name: Stock Scout
status: draft
sources:
  - _bmad-output/planning-artifacts/ux-designs/ux-stock-scout-2026-10-04/.working/direction-pro-dense.html
updated: 2026-10-04
---

# Stock Scout — Experience Spine

> Multi-surface responsive web. React 18 + shadcn/ui on Vite + Tailwind, TanStack Query, React Router. Must work perfectly on phone alone or laptop alone — neither is a degraded fallback of the other. Paired with `DESIGN.md` (dark pro-dense-clean visual direction).

## Foundation

React 18 + shadcn/ui on Vite + Tailwind. Multi-surface responsive web: phone and laptop are both first-class targets (decision record), not a desktop-primary product with a shrunk-down mobile view. `DESIGN.md` is the visual identity reference; this spine is the behavior. Multi-user-capable backend, currently single-person usage — no multi-tenant workspace concepts needed in this spine (contrast with Drift's per-project isolation).

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Dashboard | App open (post-auth) | 4-tab main view: Chart / Analysis / Trades / Alerts, with watchlist sidebar |
| Chart tab | Dashboard tabs (default) | Candlestick chart for the selected symbol, MA overlays, user drawings, alert markers |
| Analysis tab | Dashboard tabs | Screener views: stocks-above-average, Fibonacci retracement, combined screener |
| Trades tab | Dashboard tabs | Trade journal CRUD |
| Alerts tab | Dashboard tabs | Price/MA alert CRUD, active/triggered list |
| Watchlist | Sidebar (laptop) / bottom sheet (phone) | Multi-list symbol tracking; selecting a symbol drives the Chart tab |
| Login / Register / Forgot / Reset | Unauthenticated routes | Auth — structurally unchanged, re-skinned only |

Dashboard tab bar and watchlist sidebar are both always-reachable; selecting a symbol in the watchlist updates `activeSymbol` and the Chart tab re-renders for it, same as today (`DashboardPage.tsx`'s `selectedSymbol` state). On phone, the watchlist becomes a bottom sheet/tab [ASSUMPTION per decision record] rather than a permanent column, so "pick a symbol" is a deliberate open-sheet action instead of always-visible chrome.

→ Composition reference: `.working/direction-pro-dense.html` (rationale + phone/laptop frames). Spine wins on conflict, per the decision record's explicit trims (no marquee, no stat grid).

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md`.

| Do | Don't |
|---|---|
| "GOOGL crossed $150.00" | "🎉 Your alert fired!" |
| "No alerts yet. Set one from a chart." | "You haven't created any alerts. Click below to get started!" |
| "150.00 ALERT" / "152.40 LIVE" (chart tags, terse labels) | "Your target price" / "Current market price" (verbose chart labels) |
| Numeric-first: lead with the number, not a sentence describing it | "The target price for GOOGL is $150.00" as the primary row text |

[ASSUMPTION] Voice/tone wasn't addressed in the decision record beyond the mockup's terse chart-tag labels (`150.00 ALERT`, `152.40 LIVE`); extrapolated that same terseness to list rows and empty states, consistent with "pro-dense" posture.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.components` (or shadcn defaults, when inherited).

| Component | Use | Behavioral rules |
|---|---|---|
| Alert marker (chart overlay) | Chart tab, any symbol with ≥1 alert | One horizontal line + tag per alert on the charted symbol, rendered in the same SVG overlay system as user trendlines (`StockChart.tsx`). Pending (`alert-marker-pending`) and fired (`alert-marker-fired`) render simultaneously if the symbol has both. Markers reposition on pan/zoom exactly like existing drawings (`subscribeVisibleLogicalRangeChange`), since they share the coordinate-conversion pipeline. Not draggable/editable — read-only annotations, distinct from user-drawn trendlines. |
| Current-price marker (chart overlay) | Chart tab, always | One line + tag at the live price, same overlay layer. Updates on each price refresh tick, no animation — a snap, not a slide [ASSUMPTION: decision record doesn't specify transition style; snap matches "glance and know" framing]. |
| Watchlist sidebar | Dashboard, laptop (`≥ lg`) | Permanent column, unchanged from today: list-tabs row, symbol rows with drag-to-reorder, add-stock form. |
| Watchlist sheet | Dashboard, phone (`< lg`) | Same list/symbol-row content, presented in a bottom sheet triggered from a persistent affordance (e.g., a tab or handle) rather than an always-visible column. Drag-to-reorder becomes long-press-to-reorder on touch [ASSUMPTION per decision record]. |
| Trades table | Trades tab, laptop (`≥ lg`) | Existing 10-column wide table (`TradesPanel.tsx`) unchanged. |
| Trade card | Trades tab, phone (`< lg`) | One card per trade: symbol, direction badge, P&L prominent (large, `{typography.numeric-lg}`-equivalent weight). Tap expands to show buy/sell price, dates, notes — collapsed by default so the list scans fast [ASSUMPTION per decision record]. |
| Alert row | Alerts tab, both surfaces | Each row shows an inline current-vs-target comparison (two numeric values, not prose-only) in addition to the existing kind/description text. Pending rows use `{colors.alert-pending-bg}`/`{colors.alert-pending}` styling; fired rows use `{colors.alert-fired-bg}`/`{colors.alert-fired}`/`{colors.alert-fired-border}`. Applies identically on phone and laptop — this is a row-content rule, not a breakpoint-specific one. |
| Auth card | Login/Register/Forgot/Reset | Structurally unchanged centered single-column `Card` — re-skinned to dark palette only, no new behavior. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Alert fired, chart open | Chart tab | `alert-marker-fired` line stays on the chart permanently at its trigger price (alerts never re-fire, per CLAUDE.md's `alerts.ts`) — it's a historical mark, not a transient toast. The current-price line's position relative to it is what tells the "it already crossed" story. |
| Alert pending, chart open | Chart tab | `alert-marker-pending` dashed line at target, current-price line elsewhere — the gap between them is the at-a-glance state. |
| No alerts on charted symbol | Chart tab | No alert markers rendered; current-price marker still shows. No empty-state copy needed — absence is the state. |
| Cold dashboard load | Dashboard | Replaces the existing `Loader2` + "Loading stock data..." text (`DashboardPage.tsx`) with a shadcn `Skeleton` layout shaped like the real dashboard (chart card outline, watchlist rows, tab bar) so the page doesn't jump when real data arrives. |
| Empty watchlist | Sidebar / sheet | Existing `ListPlus` icon + "No stocks in this list yet." retained, re-skinned only. |
| Empty trades | Trades tab (phone) | Card-view equivalent of the existing empty state; [ASSUMPTION] same icon+text pattern as watchlist's empty state, no new copy specified in decision record. |
| Watchlist sheet closed (phone) | Dashboard, phone | Sheet affordance always visible (handle/tab); no symbol selected state falls back to existing "No stock selected" chart placeholder (`DashboardPage.tsx`). |
| Validation error | Add-stock / add-alert forms | Existing `toast.error()` pattern (sonner) retained unchanged. |

## Interaction Primitives

Mouse/touch-first — no keyboard-shortcut surface exists today and the decision record doesn't introduce one; [ASSUMPTION] out of scope for this redesign.

- Tap/click a watchlist symbol row → selects it as the charted symbol (existing behavior, `onSelectSymbol`).
- Drag (laptop) / long-press (phone) a watchlist row → reorder within the active list. [ASSUMPTION per decision record's explicit touch-adaptation note.]
- Tap a trade card (phone) → expands in place to show buy/sell/notes detail. [ASSUMPTION per decision record.]
- Click/tap a chart drawing tool button → arms that tool; next click/tap on the chart places the first point (existing `StockChart.tsx` behavior, unchanged by this redesign).
- Alert markers and the current-price marker are not interactive — no click target, no drag. They are read-only chart annotations, distinct from the draggable user-drawn trendline/ray/horizontal-line tools.

**Banned:** making alert/current-price markers draggable or editable from the chart (editing an alert's target stays a form action in the Alerts tab, not a chart gesture) — keeps the new overlay from colliding with the existing trendline drag/select interaction model.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` (dark-mode token pairs chosen for AA-legible text-on-background; verify `{colors.muted-dim}` on `{colors.background}` specifically, as it's the lowest-contrast pair in the system).

- WCAG 2.2 AA across the responsive web surface, both phone and laptop viewports.
- Alert state must not rely on color alone: pending markers are dashed-line + "ALERT"-style tag text, fired markers are solid-line + tag text — line style and label carry the distinction for colorblind users, not just amber-vs-green.
- Chart overlay tags (alert target, current price) render as real text nodes (SVG `<text>`), not image/canvas-only — screen readers and browser zoom both still work.
- Tap targets on phone (watchlist rows, trade cards, alert rows) meet the standard 44px minimum height — [ASSUMPTION] not stated in decision record, standard mobile-web floor.
- Focus rings inherit shadcn's `ring` token, re-skinned per `DESIGN.md` to stay visible at AA contrast against `{colors.background}`.

## Key Flows

### Flow 1 — Morning alert check (Mary, GOOGL $150 alert, 7am, phone)

1. Mary opens Stock Scout on her phone at 7am.
2. She taps GOOGL in the watchlist sheet.
3. The Chart tab opens for GOOGL. On the chart she immediately sees two things without navigating anywhere else: today's current price (the current-price marker, in `{colors.primary}`) and her $150 alert target (the alert marker, at `$150.00`).
4. **Climax:** the current-price line has already crossed the $150 line overnight — the alert fired while she was asleep. Because the fired marker renders in the same green as the current-price line (`{colors.alert-fired}` = `{colors.primary}`, per `DESIGN.md`), the visual read is immediate: price and target have merged. She knows the alert fired without opening the Alerts tab or hunting through a list.
5. She taps over to the Alerts tab to confirm details; the alert's row already shows `fired` styling and the inline current-vs-target comparison ($152.40 vs $150.00), corroborating what the chart already told her.

Failure: price data fails to load → existing loading/error state on the Chart tab (`DashboardPage.tsx`'s loading indicator); markers simply don't render until data resolves, no broken-partial-chart state.

### Flow 2 — Setting an alert while reviewing a chart (laptop)

1. User is on the laptop Dashboard, Chart tab open for a watchlisted symbol, reviewing candles and MA lines.
2. They switch to the Alerts tab, open the "Set an Alert" dialog (existing `AlertsPanel.tsx` flow, unchanged), and set a target price.
3. They switch back to the Chart tab for that symbol.
4. **Climax:** the new alert marker is already on the chart at the target price — no refresh, no separate confirmation step. The chart and the alert list stay in sync automatically because both read from the same alert data.

Failure: invalid target price (≤ 0) → existing `toast.error("Enter a target price greater than 0")` validation, unchanged.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| `≥ lg` (1024px+) | Watchlist sidebar permanent column beside the tab content (existing `flex-row` layout). Trades tab shows the full 10-column table. |
| `< lg` (phone) | Watchlist becomes a bottom sheet/tab. Trades tab shows one card per trade instead of the table. Alert row inline comparison and chart alert markers are identical to laptop — these are not breakpoint-gated. |

Stock Scout must work perfectly on phone alone or on laptop alone — per the decision record, neither is a degraded fallback of the other; the adaptations above (sidebar↔sheet, table↔cards, drag↔long-press) exist so each surface gets its own first-class interaction model for the same underlying data, not a single model stretched or shrunk.

## Inspiration & Anti-patterns

- **Lifted from the pro-dense mockup:** dark terminal surfaces, teal/red candle convention, monospace numerics, dashed-vs-solid line distinction for pending-vs-fired alert state.
- **Rejected — ticker-tape marquee:** explicitly dropped per the "dark + clean" refinement decision; too much always-on motion/density for the "enjoy using it" north star.
- **Rejected — dense 4-cell OHLC stat grid:** explicitly dropped per the same decision; fewer things on screen at once.
- **Rejected — re-firing alerts:** out of scope — alerts remain one-shot (`alerts.ts`), this redesign only changes how a fired alert is *displayed*, not re-arming behavior.

