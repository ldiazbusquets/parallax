// Design tokens. CSS uses the same values as custom properties (styles.css); T.* is for SVG/canvas drawing.
export const T = {
  bg: '#0c0c0c',
  panel: '#161616',
  raised: '#1f1f1f',
  line: '#242424',
  lineHi: '#333333',
  text: '#f1f1f1',
  dim: '#9b9b9b',
  faint: '#626262',
  up: '#5fd07a',
  down: '#ff5147',
  accent: '#ececec',   // primary series: near-white lines, as in the reference
  accent2: '#7ca9d4',  // the one highlight: silver blue, as on Luis's other sites (lows, outliers, interlocks)
  grid: '#2c2c2c',
  mono: "'Inter Tight', 'Helvetica Neue', Arial, sans-serif",
  sans: "'Outfit', 'Helvetica Neue', system-ui, sans-serif",
} as const;

export const tone = (v: number | null | undefined, invert = false) =>
  v == null || v === 0 || !Number.isFinite(v) ? T.dim : (v > 0) !== invert ? T.up : T.down;

/** Diverging colour for heatmap tiles: change % to a red-grey-green scale, saturating at ±cap. */
export function heat(v: number | null | undefined, cap = 3): string {
  if (v == null || !Number.isFinite(v)) return '#1e1e1e';
  const k = Math.max(-1, Math.min(1, v / cap));
  const base = [30, 30, 30];
  const to = k >= 0 ? [52, 150, 82] : [205, 58, 52];
  const a = Math.abs(k) ** 0.8;
  const c = base.map((b, i) => Math.round(b + (to[i] - b) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
