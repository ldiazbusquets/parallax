import { useMemo, useRef, useState } from 'react';
import { isNum, price } from '@/lib/format';
import { T } from './theme';

function ticks(min: number, max: number, n = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

const fmtT = (t: number, intraday: boolean) => {
  const d = new Date(t);
  return intraday ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Responsive line chart: thin neutral line on a dashed grid, the window's high and low marked
 *  (white and warm dots with a soft band), the last point tinted by direction, and a hover read-out. */
export function LineChart({ t, v, h = 200, base, intraday = false, color, fmt = price }: { t: number[]; v: number[]; h?: number; base?: number | null; intraday?: boolean; color?: string; fmt?: (n: number) => string }) {
  const W = 720, L = 6, R = 58, Tp = 14, B = 22;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const g = useMemo(() => {
    let min = Math.min(...v), max = Math.max(...v);
    if (isNum(base)) { min = Math.min(min, base); max = Math.max(max, base); }
    const pad = (max - min) * 0.08 || 1; min -= pad; max += pad;
    const x = (i: number) => L + (i / (v.length - 1)) * (W - L - R);
    const y = (n: number) => Tp + (1 - (n - min) / (max - min)) * (h - Tp - B);
    const d = v.map((n, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(n).toFixed(1)).join('');
    let hi = 0, lo = 0;
    v.forEach((n, i) => { if (n > v[hi]) hi = i; if (n < v[lo]) lo = i; });
    return { min, max, x, y, d, hi, lo };
  }, [t, v, h, base]);
  const up = v[v.length - 1] >= (isNum(base) ? base : v[0]);
  const line = color || '#cfcfcf';
  const yt = ticks(g.min, g.max, 4);
  const xIdx = [0, Math.floor(v.length / 3), Math.floor((2 * v.length) / 3), v.length - 1];
  const bandW = Math.max(6, (W - L - R) * 0.035);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(v.length - 1, Math.round(((px - L) / (W - L - R)) * (v.length - 1)))));
  };
  const last = v.length - 1;
  const mark = (i: number, c: string, label: string, above: boolean) => (
    <g>
      <rect x={g.x(i) - bandW / 2} y={g.y(v[i])} width={bandW} height={h - B - g.y(v[i])} fill="#fff" opacity="0.035" />
      <circle cx={g.x(i)} cy={g.y(v[i])} r="3.2" fill={c} stroke="#111" strokeWidth="1.2" />
      <text x={Math.max(L + 2, Math.min(g.x(i), W - R - 60))} y={g.y(v[i]) + (above ? -8 : 15)} textAnchor="middle" style={{ fill: c }}>{label}</text>
    </g>
  );
  return (
    <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${h}`} width="100%" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Price chart">
      <defs><linearGradient id="lcfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.07" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
      {yt.map((n) => <g key={n}><line x1={L} x2={W - R} y1={g.y(n)} y2={g.y(n)} stroke={T.grid} strokeDasharray="4 5" /><text x={W - R + 8} y={g.y(n) + 3}>{fmt(n)}</text></g>)}
      {xIdx.map((i, k) => <text key={k} x={g.x(i)} y={h - 5} textAnchor={k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}>{fmtT(t[i], intraday).replace(/, \d{4}$/, '')}</text>)}
      {isNum(base) && <line x1={L} x2={W - R} y1={g.y(base)} y2={g.y(base)} stroke="#d8d8d8" strokeOpacity="0.55" strokeDasharray="7 6" />}
      <path d={g.d + `L${g.x(last)},${h - B}L${g.x(0)},${h - B}Z`} fill="url(#lcfill)" />
      <path d={g.d} fill="none" stroke={line} strokeWidth="1.1" strokeLinejoin="round" opacity="0.9" />
      {g.hi !== last && mark(g.hi, '#f4f4f4', fmt(v[g.hi]), true)}
      {g.lo !== last && g.lo !== g.hi && mark(g.lo, T.accent2, fmt(v[g.lo]), false)}
      <circle cx={g.x(last)} cy={g.y(v[last])} r="3.6" fill={up ? T.up : T.down} />
      <circle cx={g.x(last)} cy={g.y(v[last])} r="8" fill={up ? T.up : T.down} opacity="0.15" />
      {hover != null && <g>
        <line x1={g.x(hover)} x2={g.x(hover)} y1={Tp} y2={h - B} stroke="#888" strokeOpacity="0.5" strokeDasharray="2 3" />
        <circle cx={g.x(hover)} cy={g.y(v[hover])} r="3.5" fill="#fff" />
        <rect x={Math.min(g.x(hover) + 8, W - R - 150)} y={Tp} width="146" height="38" rx="12" fill="#222" fillOpacity="0.92" stroke="#ffffff14" />
        <text x={Math.min(g.x(hover) + 18, W - R - 140)} y={Tp + 16} style={{ fill: T.text, fontSize: 12 }}>{fmt(v[hover])}</text>
        <text x={Math.min(g.x(hover) + 18, W - R - 140)} y={Tp + 30}>{fmtT(t[hover], intraday)}</text>
      </g>}
    </svg>
  );
}

/** Several labelled curves on a shared categorical x axis (used for the yield curve). */
export function CurveChart({ labels, series, h = 200, fmt = (n: number) => n.toFixed(2) + '%' }: { labels: string[]; series: { name: string; color: string; values: (number | null)[]; dash?: string }[]; h?: number; fmt?: (n: number) => string }) {
  const W = 720, L = 44, R = 14, Tp = 10, B = 22;
  const all = series.flatMap((s) => s.values).filter(isNum);
  if (!all.length) return null;
  let min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.1 || 0.25; min -= pad; max += pad;
  const x = (i: number) => L + (i / (labels.length - 1)) * (W - L - R);
  const y = (n: number) => Tp + (1 - (n - min) / (max - min)) * (h - Tp - B);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label="Yield curve">
      {ticks(min, max, 4).map((n) => <g key={n}><line x1={L} x2={W - R} y1={y(n)} y2={y(n)} stroke={T.grid} strokeDasharray="4 5" /><text x={L - 6} y={y(n) + 3} textAnchor="end">{fmt(n)}</text></g>)}
      {labels.map((l, i) => l ? <text key={i} x={x(i)} y={h - 6} textAnchor="middle">{l}</text> : null)}
      {series.map((s) => {
        const pts = s.values.map((v, i) => (isNum(v) ? [x(i), y(v)] : null)).filter(Boolean) as number[][];
        return <g key={s.name}>
          <path d={pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('')} fill="none" stroke={s.color} strokeWidth="1.4" strokeDasharray={s.dash} />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.6" fill={s.color} stroke="#151515" strokeWidth="1" />)}
        </g>;
      })}
    </svg>
  );
}

const vol = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(Math.round(n)));

/** Candlesticks with volume underneath, on the same dashed grid as LineChart. Bodies are muted green/red,
 *  wicks thin; the window's high and low are labelled as in the line chart; hover shows open/high/low/close. */
export function CandleChart({ t, o, hi, lo, c, v, h = 200, intraday = false, fmt = price }: { t: number[]; o: number[]; hi: number[]; lo: number[]; c: number[]; v?: number[]; h?: number; intraday?: boolean; fmt?: (n: number) => string }) {
  const W = 720, L = 6, R = 58, Tp = 14, B = 22;
  const volH = v && v.some((x) => x > 0) ? (h - Tp - B) * 0.18 : 0;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const n = c.length;
  const g = useMemo(() => {
    let min = Math.min(...lo), max = Math.max(...hi);
    const pad = (max - min) * 0.08 || 1; min -= pad; max += pad;
    const step = (W - L - R) / n;
    const x = (i: number) => L + step * (i + 0.5);
    const y = (p: number) => Tp + (1 - (p - min) / (max - min)) * (h - Tp - B - volH - (volH ? 6 : 0));
    let iHi = 0, iLo = 0;
    hi.forEach((p, i) => { if (p > hi[iHi]) iHi = i; });
    lo.forEach((p, i) => { if (p < lo[iLo]) iLo = i; });
    const vMax = v ? Math.max(1, ...v) : 1;
    return { min, max, step, x, y, iHi, iLo, vMax };
  }, [t, o, hi, lo, c, v, h, volH, n]);
  const bw = Math.max(1, Math.min(14, g.step * 0.62));
  const yt = ticks(g.min, g.max, 4);
  const xIdx = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.floor((px - L) / g.step))));
  };
  const label = (i: number, p: number, col: string, above: boolean) => (
    <text x={Math.max(L + 20, Math.min(g.x(i), W - R - 30))} y={g.y(p) + (above ? -7 : 14)} textAnchor="middle" style={{ fill: col }}>{fmt(p)}</text>
  );
  const base = h - B;
  const hv = hover != null ? hover : null;
  return (
    <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${h}`} width="100%" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Candlestick chart">
      {yt.map((p) => <g key={p}><line x1={L} x2={W - R} y1={g.y(p)} y2={g.y(p)} stroke={T.grid} strokeDasharray="4 5" /><text x={W - R + 8} y={g.y(p) + 3}>{fmt(p)}</text></g>)}
      {xIdx.map((i, k) => <text key={k} x={g.x(i)} y={h - 5} textAnchor={k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}>{fmtT(t[i], intraday).replace(/, \d{4}$/, '')}</text>)}
      {volH > 0 && v!.map((x, i) => { const hh = (x / g.vMax) * volH; return <rect key={'v' + i} x={g.x(i) - bw / 2} y={base - hh} width={bw} height={hh} fill={c[i] >= o[i] ? T.up : T.down} opacity={hv === i ? 0.45 : 0.16} />; })}
      {c.map((cl, i) => {
        const up = cl >= o[i], col = up ? T.up : T.down;
        const y1 = g.y(Math.max(o[i], cl)), y2 = g.y(Math.min(o[i], cl));
        return <g key={i} opacity={hv == null || hv === i ? 0.92 : 0.55}>
          <line x1={g.x(i)} x2={g.x(i)} y1={g.y(hi[i])} y2={g.y(lo[i])} stroke={col} strokeWidth="1" />
          <rect x={g.x(i) - bw / 2} y={y1} width={bw} height={Math.max(1, y2 - y1)} rx={bw > 5 ? 1.5 : 0} fill={col} fillOpacity={up ? 0.85 : 0.9} />
        </g>;
      })}
      {label(g.iHi, hi[g.iHi], '#f4f4f4', true)}
      {g.iLo !== g.iHi && label(g.iLo, lo[g.iLo], T.accent2, false)}
      {hv != null && <g>
        <line x1={g.x(hv)} x2={g.x(hv)} y1={Tp} y2={base} stroke="#888" strokeOpacity="0.5" strokeDasharray="2 3" />
        <rect x={Math.min(g.x(hv) + 10, W - R - 176)} y={Tp} width="172" height={v ? 84 : 70} rx="12" fill="#222" fillOpacity="0.94" stroke="#ffffff14" />
        {([['O', o[hv]], ['H', hi[hv]], ['L', lo[hv]], ['C', c[hv]]] as [string, number][]).map(([k, p], j) => (
          <text key={k} x={Math.min(g.x(hv) + 20, W - R - 166)} y={Tp + 16 + j * 13} style={{ fill: k === 'C' ? (c[hv] >= o[hv] ? T.up : T.down) : T.text, fontSize: 11 }}>{k} {fmt(p)}</text>
        ))}
        {v && <text x={Math.min(g.x(hv) + 20, W - R - 166)} y={Tp + 16 + 4 * 13} style={{ fontSize: 11 }}>Vol {vol(v[hv])}</text>}
        <text x={Math.min(g.x(hv) + 20, W - R - 166)} y={Tp + (v ? 77 : 64)}>{fmtT(t[hv], intraday)}</text>
      </g>}
    </svg>
  );
}

/** Line or candles, remembered per browser. */
export function useChartStyle(): ['line' | 'candles', (s: 'line' | 'candles') => void] {
  const [s, set] = useState<'line' | 'candles'>(() => { try { return localStorage.getItem('fintel.chartstyle') === 'candles' ? 'candles' : 'line'; } catch { return 'line'; } });
  return [s, (x) => { set(x); try { localStorage.setItem('fintel.chartstyle', x); } catch { /* storage blocked */ } }];
}

/** The price chart used by the watchlist and company pages: candles when asked for and the bars have OHLC. */
export function PriceChart({ bars, style, h, base, intraday }: { bars: import('@/data/yahoo').Bars; style: 'line' | 'candles'; h: number; base?: number | null; intraday: boolean }) {
  if (style === 'candles' && bars.o && bars.h && bars.l && bars.c.length > 1) return <CandleChart t={bars.t} o={bars.o} hi={bars.h} lo={bars.l} c={bars.c} v={bars.v} h={h} intraday={intraday} />;
  return <LineChart t={bars.t} v={bars.c} h={h} base={base} intraday={intraday} />;
}
