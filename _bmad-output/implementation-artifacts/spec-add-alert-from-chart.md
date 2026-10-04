---
title: 'Add a price alert directly from the chart'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Setting a price alert requires leaving the chart and opening the Alerts tab/dialog. The user wants to set one directly from the chart: hover at a price level, see a clear "add alert here" affordance, click it.

**Approach:** In `src/components/StockChart.tsx`, when the cursor tool is active, the mouse is over the chart, and the user isn't panning or dragging an existing drawing: render a dashed horizontal line at the hovered price (neutral `--muted-foreground` color — deliberately not `--alert-pending`/`--alert-fired`, so it's never confused with a real alert marker) spanning the plot width, plus a small circular "+" button fixed at the right edge (in the price-axis gutter, so it doesn't collide with chart content) at the hovered y. Clicking it calls the existing `useCreatePriceAlert()` hook with the hovered price (rounded to 2 decimals), shows a success/error toast (matching the existing pattern used everywhere else in this file and in `AlertsPanel.tsx`), and needs no dialog or confirmation — one click, per "keep it simple." The affordance disappears the moment a drawing tool is active, the chart is being panned, or an existing drawing is being dragged, so it never competes with those interactions.

</frozen-after-approval>

## Implementation Notes

- `src/components/StockChart.tsx`: added `hoverY` state (alongside the existing `hoverX` crosshair state), the `useCreatePriceAlert()` hook, and a `handleAddAlertFromHover` handler. Rendered as a neutral dashed line + a small primary-colored "+" circle fixed in the price-axis gutter at the hovered y, with its own `pointerEvents: "auto"` override (same technique already used for drag handles) so it's clickable even though the SVG root has `pointerEvents: "none"` in cursor mode.
- Gated on `activeTool === "cursor" && hoverY != null && !panRef.current && !dragState` — disappears during panning, dragging, or when a drawing tool is active, so it never competes with those interactions.
- Also fixed in this pass: `formatAxisDate` was calling `toLocaleDateString(undefined, ...)`, which uses the browser's locale — on a Hebrew-locale browser this rendered Hebrew month names. Forced `"en-US"` explicitly.
- **Bug found by manual testing, fixed:** the "+" button flickered and couldn't be clicked. Root cause: hover tracking was attached to the `<canvas>` element specifically; the moment the cursor crossed onto the SVG's "+" button (stacked on top at that pixel), the canvas fired `pointerleave`, hiding the button — which put the canvas back on top at that pixel, firing `pointermove` again, showing it again, in a tight loop. Fixed by moving pan/hover tracking (`onPointerDown/Move/Up/Leave`, `onWheel`) from the canvas to the shared wrapper `<div>` that contains both the canvas and the SVG, so crossing between the two internally no longer fires leave/enter at all. Also added `onPointerDown={(e) => e.stopPropagation()}` on the button itself so pressing it doesn't also bubble up and start a pan (mirroring the same guard `startDrag` already has for dragging existing lines).
- Verified: `tsc --noEmit` clean, `eslint` clean, `vite build` clean.

