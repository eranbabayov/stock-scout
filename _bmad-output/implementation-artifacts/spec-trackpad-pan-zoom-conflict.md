---
title: 'Fix: trackpad click-drag also zooms, compressing the chart unexpectedly'
type: 'bugfix'
created: '2026-10-07'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reported via two screenshots (before/after a click-and-drag-right gesture, trackpad): panning right also zoomed the chart out — candles compressed into roughly the left half of the canvas with a large blank gap on the right, and the date-axis tick count dropped from 11 to 6 labels (confirming fewer, wider-spaced bars, i.e. a real zoom-out, not just a visual illusion from panning far). Root cause: trackpads commonly fire `wheel` events during what feels like a single click-drag gesture (e.g. a two-finger pan). `handleCanvasWheel` already had a guard against running during an active drawing-line drag (`dragState`), but not against an active chart pan (`panRef.current`) — so a concurrent wheel event during a pan session modified `barSpacing` and `rightEdgeIndex` at the same time the pan handler was also modifying `rightEdgeIndex`, compounding into a pan that also zoomed.

**Approach:** Add the same guard already used for `dragState` to `handleCanvasWheel`, also checking `panRef.current` — wheel-driven zoom is now a no-op for the duration of an active pan.

</frozen-after-approval>

## Implementation Notes

- `src/components/StockChart.tsx`: `handleCanvasWheel` now returns early when `panRef.current` is set, in addition to the existing `dragState` guard.
- Verified: `tsc --noEmit` clean, `eslint` clean, `vite build` clean. No automated visual verification possible (no browser tool) — user confirmed the repro via trackpad; worth a manual re-test of the same click-drag-right gesture.
