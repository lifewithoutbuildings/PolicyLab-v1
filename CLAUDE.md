# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this is

PolicyLab is a single-page interactive macroeconomic policy simulator built with
React + Vite. Users move sliders for four policy levers — Government spending (G),
Taxes (T), Interest rate (R), and Tariffs (Tr) — and the app recomputes AD-AS,
IS-LM, money market, and labour market charts in real time, alongside headline
stats (GDP, inflation, unemployment, deficit, trade balance, real wage, Gini) and
plain-English "causal chain" explanations. It ships with preset policy scenarios
(e.g. "Volcker Shock", "Atmanirbhar Bharat", "Stagflation Trap") calibrated loosely
to real episodes, a scenario Compare mode, and historical India data (GDP/price,
Phillips curve) overlays for 2015–2024.

There is no backend — it's a static client-side app (Vite build → `dist/`,
deployable anywhere that serves static files).

## ⚠️ Repo structure gotcha — read before editing

This repo was built by uploading files through the GitHub web UI (see `git log`:
all commits are "Add files via upload"), not through normal `git add`/`git commit`
workflow. As a result there are **three copies of the main component**:

| File | Status |
|---|---|
| `src/PolicyLab.jsx` | ✅ **The live file.** Imported by `src/main.jsx` and actually built/served. |
| `policylab.jsx` (repo root, lowercase) | Byte-identical duplicate of `src/PolicyLab.jsx`. Not imported anywhere. Stray. |
| `PolicyLab.jsx` (repo root, uppercase) | A **newer, diverged, unwired draft** (1142 lines vs. 984). Has extra features (e.g. `useEffect` import, revised historical-data comments, an interest-rate/crowding-out line added to causal chains) that are NOT in the live `src/PolicyLab.jsx`. Not imported anywhere — sits dead at the repo root. |

**Always edit `src/PolicyLab.jsx`** — that's the one Vite actually builds. Before
making changes, check whether the root-level `PolicyLab.jsx` contains a newer
version of the section you're touching (diff it), since it may represent
unmerged work-in-progress that should be reconciled rather than silently
overwritten or ignored. If you clean up the stray root-level files, confirm with
the user first — they may be intentional drafts/backups rather than debris.

## Structure

```
index.html          Vite entry HTML. Loads Google Fonts, canvas-confetti (CDN),
                     hCaptcha script (CDN) — neither is currently wired into the
                     component logic; treat as available-but-unused globals.
vite.config.js       Standard @vitejs/plugin-react config, no customization.
package.json         Scripts: dev / build / preview. Deps: react, react-dom, recharts.
src/
  main.jsx           Mounts <PolicyLab /> into #root via React.StrictMode.
  PolicyLab.jsx       *** THE app. Single ~1000-line file, see below. ***
PolicyLab.jsx        Stray unwired draft — see gotcha above.
policylab.jsx        Stray unwired duplicate — see gotcha above.
```

There is no router, no state management library, no CSS framework/file (styling
is inline JS style objects using the `C` design-token map), no test suite, and no
linter config. Everything lives in one component file.

## `src/PolicyLab.jsx` internal layout

Read top-to-bottom, the file is organized into clearly commented sections:

1. **Economic engine** — `simulate(G, T, R, Tr)`: pure function mapping the four
   0–100 slider values to output/price/macro outcomes via linear approximations
   (AD/AS shifts, IS/LM shifts, etc). `makeCurve`, `adasCurves`, `islmCurves`,
   `moneyMarketCurves`, `labourCurves` generate chart-ready point arrays;
   `findInt` approximates curve intersections for equilibrium markers.
2. **Historical India data** — `INDIA_HISTORY` (GDP/price 2015–2024) and
   `INDIA_PHILLIPS` (unemployment/inflation), sourced from RBI/MoSPI/World Bank,
   used for the optional history-overlay toggle on charts.
3. **Causal chains** — `getChains(G, T, R, Tr, e)` turns slider deltas into
   ordered, human-readable explanation strings (e.g. "↑ Government expenditure →
   IS shifts right → ↑ AD → ↑Y ↑P").
4. **Scenarios** — `SCENARIOS` array of presets (name, tag, description, real-world
   context, slider values, expected effect) driving the Scenarios tab and the
   Compare tab's scenario picker.
5. **Design tokens** — `SANS`/`SERIF`/`MONO` font stacks and the `C` color object.
   All styling flows from these; there's no separate stylesheet to edit.
6. **UI atoms** — `Stat`, `Slider`, `MiniChart`, `ADASChart`, `PhillipsCurveChart`,
   `policyLabel`. Charts are built on `recharts` (Line/Area/Bar + Reference dots).
7. **`export default function PolicyLab()`** — the root component. Holds all
   state (slider values via `useState`, active `tab`, simulation `history`,
   Compare-mode `cmpA`/`cmpB` snapshots) and renders four tabs: **Simulator**,
   **Compare**, **Scenarios**, **About**.

## Development workflow

```bash
npm install     # first time only
npm run dev     # Vite dev server with HMR
npm run build   # production build → dist/
npm run preview # serve the production build locally
```

There are no automated tests and no CI config in this repo. Verify changes by
running the dev server and exercising the UI directly (move sliders, switch
tabs, load a scenario, toggle history overlays) — this is a highly visual,
interaction-driven app where the economics engine and the charts must be
checked together, not just type-checked.

## Conventions to follow

- **Single-file component style**: new UI pieces are added as additional
  functions in `src/PolicyLab.jsx` (as `Stat`/`Slider`/`MiniChart` are), not new
  files, unless the user asks you to split the file up.
- **Design tokens over literals**: use the `C` color map and `SANS`/`SERIF`/`MONO`
  font constants rather than hardcoding hex colors or font names, to keep the
  light, editorial "paper" aesthetic (cream background, burnt-orange accent,
  serif headings) consistent.
- **Pure economic functions**: `simulate` and the `*Curves` functions are pure
  and side-effect-free by design — keep new economic logic pure and derive
  chart data from slider state via `useMemo`, matching the existing pattern
  (see how `data`, `curves`, etc. are computed inside `PolicyLab()`).
- **Slider domain is 0–100**, centered at 50 (neutral policy). New levers should
  follow the same `(value - 50) / 50` normalization used for G/T/R/Tr in `simulate`.
- **Scenarios are illustrative, not literal models**: values in `SCENARIOS` and
  `INDIA_HISTORY`/`INDIA_PHILLIPS` are calibrated for pedagogical plausibility,
  not econometric accuracy — keep new entries in the same spirit and cite a
  real-world reference (`ctx` field) as the existing ones do.
- No secrets, env vars, or backend config exist in this repo — everything is
  static/client-side. If you introduce any external API calls, flag it clearly
  since that would be a meaningful architecture change for a currently offline-
  capable app.
