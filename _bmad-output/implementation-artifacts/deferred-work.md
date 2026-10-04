# Deferred Work

- source_spec: none
  summary: Alert markers on the chart (current price + target price lines/tags, fired-vs-pending states)
  evidence: Split from the UX redesign intent at build step-01's multi-goal check — independently shippable goal, deferred so the first pass (dark/light theme + toggle) stays single-goal. Depends on the theme's color tokens existing first.

- source_spec: none
  summary: Watchlist sidebar responsive layout (permanent column on laptop, bottom sheet on phone)
  evidence: Split from the UX redesign intent at build step-01's multi-goal check — independently shippable goal, deferred so the first pass (dark/light theme + toggle) stays single-goal.

- source_spec: none
  summary: Trades journal responsive layout (wide table on laptop, one card per trade on phone)
  evidence: Split from the UX redesign intent at build step-01's multi-goal check — independently shippable goal, deferred so the first pass (dark/light theme + toggle) stays single-goal.

- source_spec: none
  summary: Alerts list inline current-vs-target price comparison per row
  evidence: Split from the UX redesign intent at build step-01's multi-goal check — independently shippable goal, deferred so the first pass (dark/light theme + toggle) stays single-goal. Depends on the theme's alert-pending/alert-fired color tokens existing first.

- source_spec: none
  summary: Skeleton loading state replacing the dashboard's spinner+text
  evidence: Split from the UX redesign intent at build step-01's multi-goal check — independently shippable goal, deferred so the first pass (dark/light theme + toggle) stays single-goal.

- source_spec: `_bmad-output/implementation-artifacts/spec-dark-light-theme-toggle.md`
  summary: Add a theme toggle control to the unauthenticated/auth pages (Login, Register, Forgot/Reset Password) and the NotFound route, not just the dashboard.
  evidence: Verified real — only DashboardPage.tsx has the toggle. Low impact (the chosen theme still persists and applies correctly on those pages via localStorage, users just can't change it from there), and expanding to those pages was outside this spec's frozen Intent (dashboard header only), so deferred rather than scope-creeped in.

- source_spec: `_bmad-output/implementation-artifacts/spec-alert-markers-on-chart.md`
  summary: Add collision/stacking logic for chart price markers so an alert target near the current price doesn't overlap it illegibly.
  evidence: Verified real via Blind Hunter review — no offset logic exists today; two markers at a similar y-position will render overlapping tags. This is the single most interesting case (price near its alert), so worth a deliberate design pass rather than a quick hack.

- source_spec: `_bmad-output/implementation-artifacts/spec-alert-markers-on-chart.md`
  summary: Add a way to declutter old triggered-alert markers from the chart over time (auto-hide after N days, or a manual dismiss).
  evidence: Verified real via Blind Hunter review — a triggered alert's marker currently renders forever with no visual distinction between "fired seconds ago" and "fired months ago." Needs a UX decision, not a hasty fix.

- source_spec: `_bmad-output/implementation-artifacts/spec-custom-chart-engine.md`
  summary: Make the price-axis gutter width dynamic (based on the longest visible price label) instead of a fixed 56px.
  evidence: Verified real via Blind Hunter review — a fixed gutter can clip/crowd labels for symbols with 4-5 digit prices. Touches many interdependent coordinate functions (indexToX/xToIndex/candle/MA/marker rendering all read PRICE_AXIS_GUTTER), so it deserves a deliberate pass rather than a quick patch.

- source_spec: `_bmad-output/implementation-artifacts/spec-custom-chart-engine.md`
  summary: Re-check devicePixelRatio independent of ResizeObserver (e.g. via a matchMedia resolution listener), so moving the window to a different-DPI monitor without a CSS size change doesn't leave the canvas rendering blurry.
  evidence: Verified real via Blind Hunter review — ResizeObserver only fires on clientWidth/clientHeight changes, not DPR changes alone. Genuinely rare (multi-monitor, different DPI, no resize) and the proper fix (a resolution media-query listener) is more machinery than this edge case currently justifies.
