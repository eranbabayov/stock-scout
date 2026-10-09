---
title: 'Fibonacci retracement drawing tool'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The chart has trendline/ray/horizontal drawing tools but no Fibonacci retracement — a two-point tool (like ray/trendline) that, once placed, shows the standard 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100% retracement levels as horizontal lines with price labels, matching the reference screenshot the user provided (`C:\Users\eranb\Desktop\bugs\fib_example.png`).

**Approach:** Add `"fib"` as a fourth `DrawingType`, structurally identical to the existing two-point types (reuses `p1Date`/`p1Price`/`p2Date`/`p2Price` — no new columns). Placement reuses the existing pendingPoint/previewPoint click-to-place flow verbatim (click once for the first anchor, click again for the second), and dragging/selecting/deleting reuse the existing generic `startDrag`/`handleOverlayPointerMove`/`handleOverlayPointerUp`/`handleDeleteSelected` machinery unchanged, since those already operate on any drawing's p1/p2 regardless of type. The connector line between the two anchors renders dashed (to distinguish it from the solid-ish level lines). The 7 retracement levels are derived at render time from the drawing's own p1Price/p2Price (0% = p1's price, 100% = p2's price, matching the reference image's top-to-bottom placement) — never stored — so they automatically track live drag/placement previews for free. Level lines render full chart width with a `23.6% (765.58)`-style label at the left edge.

</frozen-after-approval>

## Implementation Notes

- **Schema/migration:** added `"fib"` to `drawingTypeEnum` in `server/src/db/schema.ts`; generated and applied `server/drizzle/0010_clammy_devos.sql` (`ALTER TYPE "drawing_type" ADD VALUE 'fib'`) via `npm run db:generate` + `npm run db:migrate`.
- **Backend:** added `"fib"` to `DrawingType` (`server/src/services/chartDrawings.ts`) and `VALID_TYPES` (`server/src/routes/chart-drawings.routes.ts`). No other route changes needed — the existing `type !== "horizontal"` check already requires p2 for any two-point type, fib included.
- **`src/components/StockChart.tsx`:**
  - New `FIB_LEVELS = [0, 23.6, 38.2, 50, 61.8, 78.6, 100]` constant.
  - `RenderLine` gained a `dashed` field; `project()`'s trendline branch now also matches `"fib"` (same direct p1→p2 connector), setting `dashed: true` only for fib so it's visually distinct from a plain trendline.
  - New `fibLevelLines` memo: for each `fib` drawing (or the live pendingPoint/previewPoint pair while placing one), computes `price = p1Price + (p2Price - p1Price) * (pct / 100)` for each level, converts to a y-pixel via the existing `priceToY`, and produces a label string. Reads `dragCurrent` the same way `renderableLines` already does, so dragging a fib's connector endpoint live-updates all 7 levels with no extra wiring.
  - Rendered as full-plot-width dashed lines with a left-aligned `"<pct>% (<price>)"` label, inserted between `renderableLines` and `priceMarkers` in the SVG so alert markers still draw on top.
  - Toolbar: new "Fibonacci Retracement" button (lucide `Percent` icon) between Horizontal Line and the Magnet separator.
  - Extended the two existing trendline/ray preview-gating conditions (the PREVIEW_ID line-to-cursor in `renderableLines`, and the pre-first-click landing-dot marker) to include `"fib"`.
- **Verification:** `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p server/tsconfig.json --noEmit`, `npx eslint` on all changed files, and `npm run build` all pass clean. Ran a throwaway script (`server/verify-fib-drawing.ts`, deleted after use) inserting/reading/deleting a real `type: "fib"` row against the dev Postgres database to confirm the enum migration actually took effect, not just that the schema file compiles.

