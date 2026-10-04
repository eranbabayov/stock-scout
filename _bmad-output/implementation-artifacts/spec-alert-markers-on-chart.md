---
title: 'Alert markers on the chart'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-stock-scout-2026-10-04/EXPERIENCE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Alerts are only visible in a separate Alerts tab/list. The original UX request (and the confirmed Key Flow: checking a GOOGL $150 alert on the phone at 7am) was to see the alert's target price alongside the stock's current price directly on the chart, so the user knows at a glance whether it's close or already fired — without switching tabs.

**Approach:** In `src/components/StockChart.tsx`, fetch the user's alerts via the existing `useAlerts()` hook and filter to the charted symbol. **Scope decision (resolved, not an open question): only `kind === "price"` alerts get a chart marker.** `kind === "moving_average"` alerts have no fixed target price to draw as a horizontal line — their target is a moving average line that already renders as its own MA overlay when selected, and the original request/Key Flow was specifically about a price alert. MA alerts remain visible only in the existing Alerts list (unchanged). For each price alert on the symbol: render one read-only horizontal line + small tag in the existing SVG overlay (same coordinate pipeline as user drawings — `priceToCoordinate`, repositions on pan/zoom via the existing `redrawTick`), not draggable/selectable, distinct from user-drawn trendlines. `status === "active"` renders dashed, `--alert-pending`/`--alert-pending-bg` colors, tag text `"{price} ALERT"`. `status === "triggered"` renders solid, `--alert-fired`/`--alert-fired-bg` (same hue as `--primary` by design — a fired alert's line visually merges with the live-price line, which is the point). Also add a current-price marker: one line + tag, always shown, `--primary` color, labeled `"{price} LIVE"`, positioned at the latest bar's close via the existing `getQuoteFromData` helper (`@/lib/stockApi`) for consistency with the rest of the app. Add the four new CSS variables these need to `src/index.css` (`--alert-pending`, `--alert-pending-bg`, `--alert-fired`, `--alert-fired-bg`, light + dark) — done as part of this change, since the theme spec deliberately left them out for this feature to define.

</frozen-after-approval>

## Implementation Notes

- `src/index.css`: added `--alert-pending`, `--alert-pending-bg`, `--alert-fired`, `--alert-fired-bg` to both `:root` (light — new values, not in DESIGN.md which only specified dark) and `.dark` (converted from DESIGN.md's hex values to this file's HSL format).
- `src/components/StockChart.tsx`: added `priceToY()` (price-only coordinate helper, since a horizontal marker doesn't need a valid x/date the way `toPixel()` requires), fetched `useAlerts()` and filtered to `symbol` + `kind === "price"`, added a `priceMarkers` memo (current-price + each matching alert, dashed/pending vs solid/fired), rendered as a new `<g>` block in the SVG overlay — plain line + rect + text tag, `pointerEvents: "none"` throughout (read-only, doesn't interfere with the existing drawing-tool interaction).
- Verified: `tsc --noEmit` clean, `eslint` clean, `vite build` clean. No automated visual verification possible (no browser tool).
- **Note:** the chart engine this feature was built on top of (`lightweight-charts`) was replaced by `spec-custom-chart-engine.md` immediately after this spec's review came back. The fixes below were applied directly in the new engine's code, in the same file, rather than as a separate pass.

## Review Triage Log

- Current-price marker's `color`/`bgColor` both resolved to the same value, making its own label text invisible against its own background — `medium`, confirmed real. Patched: outlined style (background-colored fill, primary-colored border+text) instead of solid-filled.
- Candle series' native `lastValueVisible`/`priceLineVisible` duplicating the new marker — `false`. Moot: the library this referred to no longer exists in the codebase after the chart-engine replacement.
- Marker tags overlapping the chart's native right-side price-axis labels — `medium`, confirmed real. Patched: the new engine reserves a dedicated price-axis gutter (`PRICE_AXIS_GUTTER`) that markers, candles, and MA lines all respect, rather than sharing pixels with axis text.
- A user-drawn ray's right-edge extension could end up under an opaque marker tag — `medium`, confirmed real, same root cause as the finding above. Patched by the same gutter fix: `renderableLines`' ray/horizontal extension now stops at the gutter boundary instead of the canvas's full width.
- No collision/stacking logic when the live price and an alert target land at a similar height — `low`, confirmed real, genuinely the most interesting case (price near its alert). Deferred — proper stacking/offset logic deserves its own pass, not a hasty fix; see `deferred-work.md`.
- `cssColor()`'s `getComputedStyle` calls re-running on every pan/zoom frame instead of only on theme change — `low`, confirmed real. Patched: theme colors are now resolved once via `useMemo` keyed on `resolvedTheme`, read from that everywhere else.
- "LIVE" label is actually the latest daily close from the chart's own historical data, not a polled live quote (which is what actually fires alerts, per `yahooFinance.ts`'s `getCurrentPrice`) — `medium`, confirmed real, a genuine labeling-accuracy issue. Patched: relabeled to "CLOSE" rather than building live-price polling, which is a separate, larger feature.
- No way to declutter old triggered alerts from the chart over time — `low`, confirmed real. Deferred — needs its own UX decision (auto-hide after N days? manual dismiss?), not a hasty fix; see `deferred-work.md`.
- New `--alert-*` CSS variables not registered in `tailwind.config.ts` the way `--stock-*` is — `low`, confirmed real. Patched: added matching `alert.pending`/`alert.fired` (+ `-bg` variants) Tailwind color tokens, for future reuse (e.g. the still-deferred alerts-list inline comparison).

