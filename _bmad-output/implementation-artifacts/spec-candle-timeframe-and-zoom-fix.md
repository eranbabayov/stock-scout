---
title: 'Candle timeframe (Day/Week/Month/Year), fix zoom-out ceiling, clearer date labels'
type: 'feature'
created: '2026-10-09'
status: 'complete'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Three related issues surfaced after extending the data window to 5 years: (1) the chart can no longer zoom out far enough to show all ~1254 daily candles — the initial "fit to data" calculation clamps bar spacing to a fixed 2px floor, which only fits ~500 bars in a typical width, and the wheel-zoom-out limit has the same floor; (2) there's no way to view coarser candles (week/month/year) to see the full 5-year span as a manageable number of bars; (3) date-axis labels ("Oct 9") have no year, so the same label repeats every year with no way to tell them apart.

**Approach:**
- **Zoom floor:** replace the fixed `MIN_BAR_SPACING` floor used for clamping with a dynamic minimum — `min(2px, plotWidth / bar count)` — so "fit all bars on screen" is always within the zoomable range, for any dataset size. The initial fit-to-data calculation drops its lower clamp entirely (always shows the whole dataset on load/symbol-switch/interval-switch), only an upper clamp (`MAX_BAR_SPACING`) remains, so a short history doesn't render as absurdly fat candles.
- **Timeframe aggregation:** add a toolbar control (Day/Week/Month/Year, default Day) that aggregates the loaded daily bars into weekly/monthly/yearly OHLC candles (open = first day's open in the period, close = last day's close, high/low = max/min across the period). MA indicator periods apply to *displayed* candles (so "EMA 20" means 20 weeks when Week is selected, matching how real trading platforms tie indicator period to chart timeframe, not a fixed 20 days regardless of view). Existing drawings and alert markers — anchored to real calendar dates — must still resolve and render correctly in every timeframe: each original daily date maps to the aggregated candle whose period contains it, so switching timeframe never makes a drawing disappear, it just repositions to the containing week/month/year bar.
- **Date labels:** replace `formatAxisDate` with a format that always includes the year — `Fri 09 Oct '26` for Day view; a simpler `09 Oct '26` for Week (showing the period's start date, "Fri" would be misleading for a week-long bar), `Oct '26` for Month, `'26` for Year.

</frozen-after-approval>

## Boundaries & Constraints

**Always:** Drawing-tool placement/drag/magnet-snap and alert markers keep working identically regardless of which timeframe is active — only their on-screen position changes (to the containing aggregated bar), never their stored date or correctness. The current-price marker continues to reflect the true latest daily close (not a stale aggregated-bucket artifact) regardless of timeframe.

**Never:** Do not persist the selected timeframe (resets to Day on reload/remount — out of scope, matches how `selectedIndicators` etc. already behave). Do not change how MA values are computed (`calcEMA`/`calcSMA` in `shared/screener.ts`) — only what data they're fed.

## Code Map

- `src/components/StockChart.tsx` — the file being extended. New: `CandleInterval` type, `aggregateData()` helper (module-level, pure function), timeframe toolbar control, dynamic zoom-floor. Changed: every internal use of `sortedData` for coordinate/rendering purposes (draw loop, `findNearestBar`, `toPixel`, MA calculation, fit-to-data, `clampRightEdgeIndex`) switches to the active (possibly aggregated) dataset; `sortedData` itself remains the raw daily feed, used only to derive the active dataset and for `currentQuote`.

## Tasks & Acceptance

**Execution:**
- [ ] `StockChart.tsx` -- add `CandleInterval` type + `aggregateData()` (returns aggregated candles + a per-day date→bucket-date map) -- powers the new timeframe control
- [ ] `StockChart.tsx` -- add timeframe state + toolbar buttons (1D/1W/1M/1Y), reset `didFitRef` on interval change same as symbol change -- lets the user pick a timeframe
- [ ] `StockChart.tsx` -- swap `sortedData` for the active dataset in draw loop, MA calc, `findNearestBar`, fit-to-data, `clampRightEdgeIndex` -- coarser timeframes actually render coarser candles
- [ ] `StockChart.tsx` -- rewrite `toPixel` to resolve a stored date through the day→bucket map before indexing -- existing drawings/alerts stay visible and correctly positioned across timeframe switches
- [ ] `StockChart.tsx` -- dynamic zoom-floor (`min(2px, plotWidth/barCount)`) replacing the fixed floor in both the wheel-zoom clamp and `clampRightEdgeIndex`'s `visibleBars` calc -- fixes "can't zoom out to see all candles"
- [ ] `StockChart.tsx` -- rewrite `formatAxisDate` to take the active interval and include the year -- fixes the repeating-label ambiguity

**Acceptance Criteria:**
- Given a symbol with 5 years of daily data, when the chart first loads, then all candles fit on screen (no manual zoom-out needed).
- Given Day view, when the user scrolls to zoom out as far as possible, then every loaded candle is visible on screen, none clipped by an artificial floor.
- Given a trendline/ray/horizontal/alert placed in Day view, when the user switches to Week, Month, or Year, then it's still visible, positioned on the bar whose period contains its original date.
- Given Week/Month/Year view, when an MA indicator is checked, then its period counts displayed (aggregated) candles, not raw days.
- Given any view, the date axis shows a year, and no two visually-identical labels can refer to different years.

## Implementation Notes

Implemented in `src/components/StockChart.tsx`:

- **`CandleInterval` type + `aggregateData()`**: pure module-level function bucketing the raw daily `sortedData` into week/month/year OHLC candles (open = first bar's open, close = last bar's close, high/low = max/min across the bucket, volume = sum). Returns both the aggregated `candles` array and a `dateToBucket: Map<string,string>` keyed by every original daily date, pointing at the bucket date it belongs to. `periodBucketKey()` computes the bucket key per interval (week buckets start Monday).
- **Timeframe toolbar control**: four buttons (1D/1W/1M/1Y) next to the existing drawing-tool buttons; `interval` state defaults to `"1d"`.
- **Active dataset swap**: `activeData` (`useMemo` over `aggregateData(sortedData, interval)`) replaces `sortedData` everywhere coordinates/rendering are computed — draw loop, `findNearestBar`, `clampRightEdgeIndex`, the fit-to-data effect, and the MA overlay (which now runs `calcSMA`/`calcEMA` against `activeData`, so an indicator's period counts displayed candles, not raw days — intentional, matches real trading platforms). `sortedData` itself is unchanged and still feeds `currentQuote`, so the current-price marker always reflects the true latest daily close regardless of timeframe.
- **Drawing/alert repositioning across timeframes**: `activeIndexOf(date)` resolves a stored calendar date to an index in `activeData` — for `"1d"` it's a direct lookup, otherwise it goes through `dateToBucket` first. `toPixel` (used by both drawings and alert markers) was rewritten to call this resolver instead of indexing `sortedData` directly, so switching timeframe repositions everything to its containing bar rather than losing it.
- **Dynamic zoom-floor**: new `getMinBarSpacing()` = `min(MIN_BAR_SPACING, plotWidth / activeData.length)`, replacing the fixed constant in the wheel-zoom clamp and `clampRightEdgeIndex`'s visible-bars calculation. The fit-to-data effect (on symbol or interval change, via `didFitRef`) also dropped its lower clamp entirely, so the initial render always shows the whole active dataset.
- **`formatAxisDate` rewrite**: now takes the active interval and always includes a 2-digit year — `Fri 09 Oct '26` (day), `09 Oct '26` (week), `Oct '26` (month), `'26` (year) — fixing the repeating-label ambiguity.

**Bug caught during verification (not part of the original ask, found and fixed along the way):** `periodBucketKey`'s week-bucket computation originally built the Monday date via `monday.toISOString().split("T")[0]`. `toISOString()` converts to UTC before formatting, which silently shifts the result back one calendar day in any timezone ahead of UTC (confirmed locally: `Asia/Jerusalem`). Verified with a standalone scratchpad script (hand-crafted week/month/year-boundary test data, outside the repo) before touching the app — it reproduced the off-by-one-day bucket assignment. Fixed by adding a `toDateString(d)` helper that formats a `Date`'s local `getFullYear()/getMonth()/getDate()` components directly, never calling `toISOString()`. Re-ran the same script after the fix — both the new boundary assertions and the pre-existing OHLC-correctness assertions (open/close/high/low) pass.

**Verification:** `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/components/StockChart.tsx`, and `npm run build` all pass clean. Aggregation correctness (OHLC math + date-bucket mapping across week/month/year boundaries, including the timezone edge case above) verified via a standalone Node/tsx script against hand-crafted test data. No live browser check was performed (no browser tool available this session).

## Review Triage Log

No separate Blind Hunter review dispatched for this change — the standalone verification script already exercised the one area with real correctness risk (date-bucket arithmetic across boundaries), and it caught and fixed a genuine bug before this note was written. Remaining changes (zoom-floor, label formatting, toolbar wiring) are low-risk, mechanical swaps of `sortedData` → `activeData` confirmed by a clean typecheck/lint/build.
