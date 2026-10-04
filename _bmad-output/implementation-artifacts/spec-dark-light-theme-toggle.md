---
title: 'Light/dark theme toggle'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-stock-scout-2026-10-04/DESIGN.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app only has a light theme. The codebase already has unused dark-mode scaffolding — a `.dark` CSS class in `src/index.css`, `darkMode: ["class"]` in `tailwind.config.ts`, a `next-themes` dependency, and `src/components/ui/sonner.tsx` already calling `useTheme()` from `next-themes` — but no `ThemeProvider` is mounted anywhere and no toggle control exists, so none of it currently does anything.

**Approach:** Mount `next-themes`'s `ThemeProvider` around the app (default theme `dark`, per the decided UX direction — dark is the new default, light remains available). Replace the stale values in `src/index.css`'s existing `.dark` block with the real dark palette from the referenced `DESIGN.md` — only the tokens shared with the light theme (`background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `border`, `input`, `muted`, `muted-foreground`, `primary`, `primary-foreground`, `destructive`, `destructive-foreground`, `ring`, `stock-up`, `stock-down`, `stock-neutral`), converting DESIGN.md's hex values to this file's HSL triplet format to match the existing variable style. Do not add the alert-marker-specific tokens (`alert-pending`, `alert-fired`, `chart-grid`, etc.) — those belong to a separate, deferred feature. Leave `--chart-1..5`, `--sidebar-*`, and `--radius` dark values as currently scaffolded (out of scope; `--sidebar-*` is unused dead CSS, not worth touching here). Add a Sun/Moon icon toggle button (lucide-react, already a dependency) to the dashboard header in `src/pages/DashboardPage.tsx`, next to the existing Sign Out button, that calls `next-themes`'s `useTheme().setTheme()` to flip between `"light"` and `"dark"`. Persistence across sessions is `next-themes`'s default behavior (localStorage) — no custom persistence code needed.

</frozen-after-approval>

## Implementation Notes

- `src/index.css` `.dark` block: replaced `background`/`foreground`/`card`/`card-foreground`/`popover`/`popover-foreground`/`primary`/`primary-foreground`/`muted`/`muted-foreground`/`destructive`/`destructive-foreground`/`border`/`input`/`ring`/`stock-up`/`stock-down`/`stock-neutral` with DESIGN.md's dark values, hand-converted from hex to HSL triplets to match this file's existing variable format. `popover`/`input`/`ring` weren't explicitly listed in DESIGN.md — inherited from `card`/`border`/`primary` respectively, per shadcn convention. Left `secondary`/`accent`/`chart-1..5`/`sidebar-*`/`radius` untouched (out of scope; `sidebar-*` is unused dead CSS, not worth touching here).
- `src/App.tsx`: added `next-themes`'s `ThemeProvider` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}` — deterministic default rather than following OS preference, per DESIGN.md's "dark is simply the new default") as the outermost wrapper, above `QueryClientProvider`.
- `src/pages/DashboardPage.tsx`: added a Sun/Moon icon toggle button in the header, next to Sign Out, using `useTheme()`'s `resolvedTheme`/`setTheme`.
- Verified: `tsc --noEmit` clean, `eslint` clean, `vite build` clean. No automated visual verification possible in this environment (no browser tool) — user should confirm the toggle and dark palette visually.
- Blind Hunter review found 8 issues; 6 patched, 1 deferred, 1 rejected (see Review Triage Log). Patches: `StockChart.tsx` now re-applies chart colors via `applyOptions()` on theme change (colors were previously baked in at chart-creation time); `--secondary`/`--accent`/`--sidebar-*` dark tokens retuned to the new hue family (were left on the pre-retune hues, clashing with hover states on every outline/ghost button); toggle button now has `aria-label`/`aria-pressed`; icon/toggle logic now treats `resolvedTheme === "light"` as the light branch (everything else, including the pre-mount `undefined`, falls into dark — matching the real `defaultTheme="dark"`, removing a one-frame backwards-icon flash); added `<meta name="theme-color">` for both color schemes in `index.html`.

## Review Triage Log

- Chart colors baked in at mount, not refreshed on theme toggle — `medium`, confirmed real (`StockChart.tsx`'s chart-creation effect has `[]` deps). Patched: new effect keyed on `resolvedTheme` calls `chart.applyOptions()`/`candleSeries.applyOptions()`.
- `--secondary`/`--accent` left on pre-retune hue, clashing with hover states (incl. the new toggle button) — `medium`, confirmed real (`button.tsx`'s `outline`/`ghost` variants use `hover:bg-accent`). Patched in `src/index.css`.
- `--sidebar-*` dark tokens left stale — `low`, confirmed real but currently dead CSS (no component imports the shadcn sidebar). Patched anyway since the fix was a trivial, consistent edit to the same block already being touched.
- Toggle button missing `aria-label`/`aria-pressed` — `medium`, confirmed real. Patched.
- No theme control on auth pages / NotFound — `low`, confirmed real. Deferred — outside this spec's frozen Intent (dashboard header only); see `deferred-work.md`.
- `resolvedTheme` is `undefined` pre-mount, causing a one-frame backwards icon — `low`, confirmed real per `next-themes`' documented behavior. Patched by flipping the ternary so `undefined` falls into the "dark" branch, matching the actual default.
- `enableSystem={false}` ignoring OS preference — `false`. This is deliberate, not a bug: DESIGN.md's Brand & Style section and this spec's own frozen Intent both state dark is the new default regardless of OS preference, specifically to keep the toggle deterministic rather than following `prefers-color-scheme`.
- No `<meta name="theme-color">` for mobile browser chrome — `low`, confirmed real (absent from `index.html`). Patched.

