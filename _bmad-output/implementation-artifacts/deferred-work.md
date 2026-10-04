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
