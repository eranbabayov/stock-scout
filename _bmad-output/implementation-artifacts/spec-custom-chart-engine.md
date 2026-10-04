---
title: 'Custom candlestick chart engine (replace lightweight-charts)'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The chart currently renders via `lightweight-charts` (TradingView's own open-source library) — candles, MA overlays, pan/zoom, axes. The drawing-tool (trendline/ray/horizontal + magnet-snap) and alert-marker overlays, both hand-built this session, depend on its coordinate-conversion APIs (`timeToCoordinate`, `priceToCoordinate`, `coordinateToLogical`, etc.). The user explicitly wants a from-scratch, in-house chart engine instead (visually similar to TradingView), accepting the real risk of regressing the drawing tools and markers, which required real debugging effort to get working correctly earlier this session.

**Approach:** Build a canvas-based rendering engine inside `src/components/StockChart.tsx`: own state for the visible bar-index range and visible price range, mouse-drag pan, wheel-zoom (anchored at cursor), a `ResizeObserver`-driven resize, and a render loop drawing grid lines, a date-labeled time axis, a price-labeled price axis, candle bodies/wicks, MA overlay lines, and a crosshair + OHLC tooltip on hover. Auto-fit the visible range to the data on load and on symbol change (mirroring the existing fit-content + auto-scale-reset behavior, including the earlier fix for the "price scale stuck on old symbol's range" bug). Rewire the existing `toPixel`, `priceToY`, `findNearestBar`, and `resolveFromPixel` functions' *internals* to compute from this new engine's state instead of calling `lightweight-charts`' API — their signatures and behavior stay identical, so the drawing-tool and alert-marker code that calls them (placement, drag, magnet-snap, delete, alert/current-price markers) needs no changes. Remove the `lightweight-charts` dependency from `package.json` once the rewrite is verified working. Rendering technology is canvas 2D (not SVG, which doesn't scale to many candles; not WebGL, which is unnecessary complexity for this scope) — the existing SVG overlay for drawings/markers is unchanged and continues to sit on top of the new `<canvas>` the same way it sat on top of `lightweight-charts`' own canvases.

## Boundaries & Constraints

**Always:** Preserve exact current behavior for trendline/ray/horizontal-line placement, dragging (whole-line and per-endpoint), magnet-snap-to-bar-close, selection, and delete. Preserve the current-price and alert-marker overlays added just before this change. Preserve the MA indicator checkboxes, colors, and calculation (`shared/screener.ts`, unchanged). Preserve light/dark theme reactivity (colors re-read and redrawn on toggle). Preserve the component's public interface (`symbol`, `data` props) so `DashboardPage.tsx` needs no changes.

**Never:** Do not add touch/pinch gesture support in this pass (mouse + wheel only, matching what was reachable via `lightweight-charts` in this app). Do not add new indicator types or chart features beyond what exists today. Do not modify the drawing-tool or alert-marker *business logic* (state machine, API calls, color/label rules) — only the coordinate-source plumbing beneath it.

</frozen-after-approval>

## Code Map

- `src/components/StockChart.tsx` — the file being substantially rewritten. Keep: all drawing/alert/MA state and handlers, the component's props, the SVG overlay JSX structure. Replace: the `lightweight-charts` import and chart-creation effect, and the internals of `toPixel`/`priceToY`/`findNearestBar`/`resolveFromPixel` (not their call sites).
- `shared/screener.ts` — `calcEMA`/`calcSMA`, unchanged; still feeds MA overlay values into the new canvas renderer.
- `package.json` — remove the `lightweight-charts` dependency once the rewrite is verified working end-to-end.

## Tasks & Acceptance

**Execution:**
- [ ] `src/components/StockChart.tsx` -- build engine state (visible index range, visible price range) + pan (mouse drag) + zoom (wheel, cursor-anchored) + resize (`ResizeObserver`) -- replaces lightweight-charts' interaction entirely
- [ ] `src/components/StockChart.tsx` -- build the canvas render loop: grid, time axis, price axis, candle bodies/wicks, MA lines, crosshair + OHLC tooltip -- replaces lightweight-charts' rendering entirely
- [ ] `src/components/StockChart.tsx` -- rewire `toPixel`/`priceToY`/`findNearestBar`/`resolveFromPixel` to the new engine's coordinate math, same signatures -- keeps existing drawing-tool/alert-marker code working unchanged
- [ ] `src/components/StockChart.tsx` -- auto-fit visible range to data on load/symbol change; theme-reactive redraw on toggle -- mirrors existing fit-content + auto-scale-reset behavior
- [ ] `package.json` -- remove `lightweight-charts` once the above is verified (typecheck/lint/build, manual review of the diff)

**Acceptance Criteria:**
- Given a symbol with data, when the chart first renders, then candles + selected MA overlays are visible, the visible range is fit to the data, and the SVG overlay aligns correctly with the canvas beneath it.
- Given the user drags the chart, when releasing, then the visible range pans and the SVG overlay repositions in sync, with no drift between canvas and overlay.
- Given the user scrolls on the chart, then the visible range zooms anchored at the cursor position.
- Given the user places, drags (whole-line and per-endpoint), or deletes a trendline/ray/horizontal line with magnet on or off, then it behaves exactly as before this change.
- Given the user toggles light/dark theme, then all chart colors (background, grid, candles, axis text) update without a page reload.
- Given a symbol with a price-target alert, then the current-price and alert markers render at the correct price level and reposition correctly on pan/zoom/resize.
- Given the user switches from a high-priced symbol to a low-priced one, then the visible price range re-fits to the new symbol immediately (no stuck-scale regression of the bug fixed earlier this session).

## Implementation Notes

- Built entirely inside `src/components/StockChart.tsx`: a `ViewState` ref (`rightEdgeIndex`, `barSpacing`) drives a logical-index coordinate model matching how `lightweight-charts`' own logical range worked, specifically so `findNearestBar`'s existing `Math.round(logical)` pattern needed no behavior change. `indexToX`/`xToIndex`/`priceToYRaw`/`yToPrice` are the new coordinate primitives; `toPixel`/`priceToY`/`findNearestBar`/`resolveFromPixel` keep their exact signatures, only their internals changed.
- Price range always auto-fits the currently-visible bars (10% padding) — no manual-override flag to get stuck, which by construction avoids the "stuck on old symbol's range" bug fixed earlier this session for the old library.
- Pan = pointer drag on the canvas, zoom = wheel (anchored at cursor position), resize = `ResizeObserver` + device-pixel-ratio-aware canvas backing size. Reserved a `PRICE_AXIS_GUTTER` (56px) on the right for price-axis labels so candles/MA lines/drawings/markers never share pixels with them.
- MA overlays, drawing tools (trendline/ray/horizontal, magnet, drag, delete), and alert/current-price markers are otherwise unchanged — same state, same handlers, same SVG overlay — only their coordinate source changed.
- Removed the `lightweight-charts` npm dependency once the rewrite was verified; bundle size dropped ~170KB (690KB → ~521KB) as a direct result.
- Verified: `tsc --noEmit` clean, `eslint` clean, `vite build` clean. No automated visual verification possible (no browser tool) — this is the highest-risk change of the session and genuinely needs the user's manual check of pan/zoom/trendline/ray/magnet/drag/delete.
- **Bug found by manual testing, fixed:** the hover "+" add-alert button (from `spec-add-alert-from-chart.md`) flickered and couldn't be clicked — see that spec's notes for the root cause and fix (pan/hover handlers moved from the canvas to the shared wrapper div).

## Review Triage Log

- Wheel-zoom mid-drag leaves a dragged line's frozen pixel baseline inconsistent with the new coordinate mapping, causing a visible warp — `low` (requires simultaneously dragging a line and scrolling, an uncommon combined gesture), fix is a one-line guard. Patched: `handleCanvasWheel` now no-ops while `dragState` is set.
- Crosshair rendering had no `!panRef.current`/`!dragState` guard despite its own comment saying it should be suppressed then, inconsistent with the add-alert affordance's gating added right after it — `low`, confirmed real. Patched: same guard added.
- No `touch-action: none`, so native touch scroll/pinch could fight the hand-rolled pointer-driven pan/zoom — `low`, confirmed real; doesn't add touch gesture support (still out of scope per this spec's Boundaries), just stops the browser's default touch behavior from interfering with the existing mouse/pointer handlers. Patched.
- No `e.button === 0` check on pan start, so right/middle-click-drag also panned and swallowed pointer capture — `medium`, confirmed real. Patched.
- No clamping of `rightEdgeIndex`/`barSpacing` to the data's bounds — panning/zooming far enough past the data produced a blank chart with no way back short of switching symbols — `medium`, confirmed real. Patched: added `clampRightEdgeIndex`, applied in both the pan and zoom handlers.
- `handleAddAlertFromHover` had no guard against `createPriceAlert.isPending`, so a fast double-click could create duplicate alerts — `low`-`medium`, confirmed real. Patched.
- Fixed price-axis gutter width (56px) doesn't scale for longer price labels (4-5 digit prices) — `low`, confirmed real. Deferred — touches many interdependent coordinate functions; see `deferred-work.md`.
- Crosshair was missing the paired price/date readout conventionally expected alongside it (this spec's own Tasks list had committed to "crosshair + OHLC tooltip," only partially delivered) — `medium` against this spec's own stated scope, confirmed real. Patched: added a highlighted price label on the axis, a highlighted date label on the bottom axis, and a small OHLC readout in the corner, all gated the same way as the crosshair lines.
- `ResizeObserver` doesn't react to a DPR-only change (e.g. moving the window to a different-DPI monitor without resizing) — `low`, confirmed real. Deferred — see `deferred-work.md`.
- `toPixel` did an O(n) `findIndex` scan per point instead of reusing a hoisted date→index map — `low`, confirmed real, simple fix. Patched: hoisted a shared `dateToIndex` map (also now reused by the MA-overlay rendering, which was independently rebuilding the same map every draw).
- Claimed that very short histories could render "1-2 candles stretched across the whole canvas" — `false`. Checked the actual fit-to-data formula: `barSpacing` is clamped to `MAX_BAR_SPACING` (100px), so a short history renders at a bounded candle width with blank space filling the rest of the canvas, not stretched candles filling it.

## Verification

**Commands:**
- `npx tsc -p tsconfig.app.json --noEmit` -- expected: no errors
- `npx eslint src/components/StockChart.tsx` -- expected: no errors
- `npm run build` -- expected: clean build

**Manual checks (if no CLI):**
- No browser tool available in this environment — the user should manually verify pan/zoom/drawing-tool/marker behavior visually once implemented.
