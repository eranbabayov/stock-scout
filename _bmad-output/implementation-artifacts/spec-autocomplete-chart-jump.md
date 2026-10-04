---
title: 'Richer autocomplete suggestions; jump to chart for already-tracked symbols'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `SymbolAutocomplete.tsx`'s suggestions currently show only the bare symbol text. The user wants suggestions for symbols they already track to show the same price/change info as a watchlist row, and — specifically in the "Add Stock" form only — clicking one should jump straight to that symbol's chart instead of just filling the input (it's already tracked, re-adding is moot).

**Approach:** `SymbolAutocomplete.tsx` fetches price data for its own suggested symbols via the existing `useStockData(symbols)` hook (self-contained, same 5-minute staleTime cache as everywhere else — calling it again here is cheap, React Query dedupes by key) and renders each suggestion like `WatchlistSidebar`'s `SymbolRow` (price, change %, up/down color/icon via the existing `getQuoteFromData` helper and `.stock-up`/`.stock-down` conventions). Add an optional `onSelectTracked?: (symbol: string) => void` prop: when provided, clicking a suggestion calls it (and clears the input) instead of filling the field; when omitted (unchanged for `TradesPanel`/`AlertsPanel`), today's fill-the-field behavior is unchanged.

`DashboardPage.tsx`'s `Tabs` becomes controlled (`activeTab` state, default `"chart"`) so a new `goToChart(symbol)` handler can force-switch to the Chart tab *and* set the selected symbol — threaded through `WatchlistSidebar` → `AddStockForm` → `SymbolAutocomplete`'s new `onSelectTracked`, only in that one path. The existing watchlist sidebar row click keeps its current behavior unchanged (selects the symbol, does not force a tab switch) — only this new explicit "view chart" action from the autocomplete forces the switch.

</frozen-after-approval>

## Implementation Notes

- `SymbolAutocomplete.tsx`: fetches `useStockData(symbols)` for its own suggestion list, renders price + change% per row matching `WatchlistSidebar`'s `SymbolRow` convention (up/down icon + color, `.price-up`/`.price-down`/`.price-neutral`). New `onSelectTracked` prop short-circuits `select()` to clear the input and call it instead of filling the field.
- `DashboardPage.tsx`: `Tabs` is now controlled (`activeTab` state, default `"chart"`); added `goToChart(symbol)` passed down as `onViewChart`. The existing watchlist-row click path (`onSelectSymbol`) is untouched — only the new autocomplete path forces a tab switch.
- Threaded `onViewChart` through `WatchlistSidebar` → `AddStockForm` → `SymbolAutocomplete`'s `onSelectTracked`. `TradesPanel`/`AlertsPanel` don't pass it, so their autocomplete keeps today's fill-the-field behavior unchanged.
- Verified: `tsc --noEmit` clean, `eslint` clean, `vite build` clean.

