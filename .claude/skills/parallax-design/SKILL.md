---
name: parallax-design
description: Luis's Parallax terminal design system (Vexto-inspired dark glass look, type, color, layout, motion, data honesty). Use for any UI work on Parallax and other Luis finance dashboards; it overrides generic design skills on brand.
---

# Parallax design system

Parallax is an open-source Bloomberg/Palantir-style financial terminal (repo ldiazbusquets/parallax, app in
`fintel-project/`). Its look comes from the "Vexto" transit-dashboard reference Luis chose: calm, dark,
premium, data-first. This skill wins over generic design skills (taste, impeccable, frontend-design) wherever
they disagree on brand. Use them for craft and checks, never for colors, fonts or tone.

## 1. Non-negotiables
- **Real data only.** Every number comes from a named source. No placeholder figures, fake sparklines, sample
  rows or "fallback" values. If a source fails, show its error or stale state. Cite the provider in the footer.
- **No yellow/amber.** Luis dislikes it. The single accent is silver blue `#7ca9d4` (hi `#a9c8e6`), as on his terminal/Lab, used sparingly.
- **Calm, not flashy.** It's a tool people stare at for hours. Motion and color carry meaning, never decoration.

## 2. Tokens (src/ui/styles.css `:root`, src/ui/theme.ts `T`)
| Role | Value |
| --- | --- |
| Page | `#0c0c0c`, faint radial highlight top-right |
| Card | gradient `#1b1b1b → #141414`, 1px `rgba(255,255,255,.045)` border, radius 22px |
| Raised / pill | `#1f1f1f` |
| Text / dim / faint | `#f1f1f1` / `#9b9b9b` / `#626262` |
| Up / down | `#5fd07a` / `#ff5147` (desaturated, never neon) |
| Accent | `#7ca9d4` silver blue: window lows, focus ring, active command, highlights |
| Glass | `rgba(30,30,30,.55)` + `blur(20px) saturate(150%)`, border `rgba(255,255,255,.08)` |
| Event colors | conflict `#ff5147`, protest `#5aa9ff`, coercion `#b48cff` |

## 3. Type
- **Outfit** (300–600) for UI text; **Inter Tight** light with tabular figures for numbers.
- Sentence case everywhere. No uppercase letter-spaced labels (that was the old terminal look).
- Panel titles 15px/400 with a faint ↗. Display numbers 28px light, decimals dimmed via `<Big>` (78.3 → "78" bright, ".3" dim).
- Big overlay titles (map) 30px light, tight tracking.

## 4. Components
- `<Panel title src span note right>` renders loading / error / needs-key states; source and "updated" are in the header tooltip and status menu, and `note` folds under "About this data". Never hand-roll those.
- Tabs and buttons are pills (999px). Active tab: light pill `#ececec` with dark text.
- KPI tiles: `#1d1d1d`, radius 14px, label 12px dim, value via `<Big>`.
- Tables: dashed row rules, light numerals, right-aligned numbers, sentence-case headers.
- Charts: thin neutral line (#cfcfcf), dashed grid, dashed base line, high marked white, low marked accent, last point tinted up/down. No heavy fills.
- Overlays on the map (country card, legends, controls, popups) are glass.

## 5. Layout
- 12-column grid; spans c3/c4/c6/c8/c12. Workspaces (tabs) each have default rows in `WORKSPACES` (`src/ui/layout.tsx`); every row sums to 12.
- **Pair panels by natural height** so rows don't leave holes. Measure on the live site (set `main > .slot { align-self: start }` and read heights) before choosing rows; aim for under ~200px of slack per row.
- Narrow cards (c3/c4) cap their body at 600px and scroll inside; long tables never stretch a row.
- The map is the hero: c8 next to the indices on Overview, full-width and tall on Geo. It frames the selected country to its real borders and outlines it.
- Check 1280, 1440 and phone widths; the top bar stays on one line at laptop width.

## 6. Motion (follow emil-design-eng for details)
- Purpose first: state change, spatial continuity, feedback. Never decorate things people see 100×/day (no animation on the command bar or tab switches beyond an instant state change).
- Durations: press 120–160ms, hovers 150ms, popovers 180–220ms, panels/cards entering 250–350ms, map camera flights ~1.5s (the one place long motion is fine).
- Easing: `cubic-bezier(0.23, 1, 0.32, 1)` for entrances; never ease-in on UI.
- Allowed flourishes from the reference video: cards fade-and-rise once on first load (8px, staggered 40–60ms), numbers ease to new values on refresh (short, ≤400ms), map dots glow softly. Respect `prefers-reduced-motion` (fade only).
- Animate transform/opacity only.

## 7. Copy
- Plain English, specific numbers, no hype ("Revolutionary", "Unlock"). Say what a number is and where it's from in the panel note.
- When data is automated or lagged (GDELT coding, OECD monthly yields, IMF saved copy), say so in the note.

## 8. Before you call UI work done
1. `npm run build` and `npm test` green.
2. Look at it: Playwright screenshot locally, then the live site in Luis's Chrome after deploy (real data). Measure row gaps.
3. Nothing invented, nothing amber, decimals dimmed, sources cited, errors handled.
4. Commit with the attribution lines; push to ldiazbusquets/parallax.
