---
title: 'Fix: drawing tools broken by pointer-capture regression; add placement preview'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trendline, ray, and horizontal-line placement stopped working entirely. Root cause: the earlier fix for the add-alert "+" button flicker moved pan handling (`onPointerDown`, which calls `setPointerCapture`) from the canvas to the shared wrapper div — but that handler started a pan (and captured the pointer) on *every* pointerdown, regardless of which tool was active. Per the Pointer Events spec, an element that has captured a pointer also receives the synthesized `click` event for it — so once the wrapper captured on a drawing-tool click, the SVG's own `onClick` (which places points) never fired. Also: the user wants a dashed preview showing where a click would land, visible immediately after picking a drawing tool, before the first click.

**Approach:** Guard `handleCanvasPointerDown` to only start a pan when `activeTool === "cursor"` — panning is a cursor-tool-only interaction; a drawing tool being active means the SVG owns the interaction and the wrapper must not intercept it. For the preview: compute the point the next click would resolve to (reusing the existing `resolveFromPixel`/`toPixel`, gated on `activeTool !== "cursor"` and hovering) and render it — a full-width dashed line + landing-point marker for the horizontal tool (single click), a landing-point marker alone for trendline/ray before the first point is placed (the existing `renderableLines` preview-line logic already covers the segment from the first point to the cursor once that point exists).

</frozen-after-approval>

## Implementation Notes

- `src/components/StockChart.tsx`: `handleCanvasPointerDown` now returns early when `activeTool !== "cursor"`, before touching `panRef`/`setPointerCapture`.
- New JSX block (gated `activeTool !== "cursor"`) renders the placement preview, reusing `resolveFromPixel`/`toPixel` against the already-tracked `hoverX`/`hoverY` — no new state needed.
- Verified: `tsc --noEmit` clean, `eslint` clean, `vite build` clean. This was a real regression from an earlier fix in this same session — worth the user re-testing placement, drag, and magnet-snap for all three tools to confirm nothing else was affected by the same pointer-capture change.

