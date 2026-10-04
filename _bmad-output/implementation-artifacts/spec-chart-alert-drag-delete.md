---
title: 'Drag alert markers on the chart to retarget; delete from the chart'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Price alert markers on the chart are currently read-only — retargeting or removing an alert requires the separate Alerts tab. The user wants to drag an alert's line to change its target price directly, and delete it from the chart.

**Approach:** Backend: no update-alert capability exists yet (only create/delete). Add `updateAlertTargetPrice(userId, alertId, targetPrice)` to `server/src/services/alerts.ts`, mirroring `createPriceAlert`'s own logic — only for `kind === "price"` alerts, re-fetches the live price via `getCurrentPrice` and recomputes `direction` exactly as creation does (dragging to a new price must not leave a stale direction that fires immediately or never), and resets `status` to `"active"`/`triggeredAt` to `null` if the alert had already fired (retargeting a fired alert is "I want a new alert here," not an edit to history). Add `PATCH /api/alerts/:id` (body `{ target_price }`) and a matching `useUpdateAlert()` hook, following the same shape as every other PATCH route/hook in this codebase (`chart-drawings`, `trades`, `watchlist-lists/reorder`).

Frontend: in `src/components/StockChart.tsx`, give each alert marker's line a `pointerEvents: "auto"` hit-stroke (cursor tool only, same pattern as the existing drawing-tool lines) so it's click-to-select and drag-to-retarget. Selecting an alert marker shows the existing toolbar's delete button (extend its condition to cover a selected alert, not just a selected drawing) — clicking it calls `useDeleteAlert()` (already exists). Dragging updates the line's position live (same pixel-tracking approach already used for drawings) and commits via `useUpdateAlert()` on release, past the same movement threshold used for drawings (distinguishes a click-to-select from an actual drag). The current-price marker stays read-only — only alert markers (not the live-price line) become interactive.

</frozen-after-approval>

## Implementation Notes

- Backend: `updateAlertTargetPrice` added to `server/src/services/alerts.ts`, `PATCH /api/alerts/:id` added to `alerts.routes.ts`, `useUpdateAlert()` added to `useStocks.ts`. Verified end-to-end against the real DB via a throwaway script: create → update (price + direction both change correctly) → appears updated in `listAlerts` → not-found case handled → delete. Also separately confirmed direction actually flips (not just recomputed to the same value) when the new target crosses the current price.
- Frontend: alert markers in `StockChart.tsx` gained a hit-stroke (cursor tool only, same pattern as drawing lines), `startAlertDrag`, and `AlertDragState`. Drag updates `alertDragCurrent` live (read by `priceMarkers` to show the dragged position before commit), commits via `useUpdateAlert()` past the same movement threshold used for drawings. Selection (`selectedAlertId`) and drawing selection (`selectedDrawingId`) are mutually exclusive — selecting one clears the other. The toolbar's delete button and the Delete/Backspace keyboard shortcut now handle either selection. The current-price marker stays non-interactive (no hit-stroke) — only alert markers became draggable.
- Verified: `tsc --noEmit` clean (both frontend and server), `eslint` clean, `vite build` clean.

