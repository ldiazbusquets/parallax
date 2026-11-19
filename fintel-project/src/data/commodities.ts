import { getJSON } from '@/lib/http';
import { HOST, snap, snapTime, STATIC } from '@/lib/env';
import { getKey } from '@/lib/keys';
import { fredSeries, type Series } from './fred';
import { chartLive } from './yahoo';
import type { SourceDef } from './store';

// Commodities tab: futures curves (Yahoo contract months), EIA weekly inventories against their 5-year range,
// and long weekly history for gold vs real yields, the dollar and metal ratios. Unit-tested in commodities.test.ts.

// ============================ Futures curves
export interface CurveDef { key: string; label: string; root: string; ex: 'NYM' | 'CMX'; unit: string; n: number; months?: string; dp: number }
/** Energy: every month for two years. Metals: their active delivery months only (the others barely trade). */
export const CURVE_DEFS: CurveDef[] = [
  { key: 'cl', label: 'WTI crude', root: 'CL', ex: 'NYM', unit: '$/bbl', n: 24, dp: 2 },
  { key: 'bz', label: 'Brent crude', root: 'BZ', ex: 'NYM', unit: '$/bbl', n: 24, dp: 2 },
  { key: 'ng', label: 'Natural gas', root: 'NG', ex: 'NYM', unit: '$/MMBtu', n: 24, dp: 3 },
  { key: 'rb', label: 'Gasoline (RBOB)', root: 'RB', ex: 'NYM', unit: '$/gal', n: 18, dp: 4 },
  { key: 'ho', label: 'Heating oil', root: 'HO', ex: 'NYM', unit: '$/gal', n: 18, dp: 4 },
  { key: 'gc', label: 'Gold', root: 'GC', ex: 'CMX', unit: '$/oz', n: 26, months: 'GJMQVZ', dp: 1 },
  { key: 'si', label: 'Silver', root: 'SI', ex: 'CMX', unit: '$/oz', n: 26, months: 'HKNUZ', dp: 3 },
  { key: 'hg', label: 'Copper', root: 'HG', ex: 'CMX', unit: '$/lb', n: 26, months: 'HKNUZ', dp: 4 },
];
const MC = 'FGHJKMNQUVXZ';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Contract symbols (CLF27.NYM …) from this month on, with their delivery month. */
export function contracts(d: CurveDef, now = new Date()): { sym: string; y: number; m: number }[] {
  const out: { sym: string; y: number; m: number }[] = [];
  for (let i = 0; i < d.n; i++) {
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)), m = t.getUTCMonth(), y = t.getUTCFullYear();
    if (d.months && !d.months.includes(MC[m])) continue;
    out.push({ sym: `${d.root}${MC[m]}${String(y).slice(2)}.${d.ex}`, y, m });
  }
  return out;
}
export interface CurvePt { sym: string; label: string; px: number; wk: number | null }
export interface Curve { key: string; label: string; unit: string; dp: number; pts: CurvePt[] }
export interface CurvesData { at: number; curves: Curve[] }
interface SparkRes { symbol: string; response?: { meta?: { regularMarketPrice?: number; regularMarketTime?: number }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }
/**
 * Price per contract: the last trade if it is recent, otherwise the latest daily settlement (thin months can show a "last
 * price" from months ago while their settlements are current). Week ago = the settlement five sessions back.
 * Contracts with no settlement in the window (expired, not listed yet) are dropped, and so is a front month that has
 * stopped settling while later ones go on (it has expired).
 */
export function curveFrom(def: CurveDef, res: SparkRes[], now = Date.now()): Curve {
  const by = new Map(res.map((r) => [r.symbol, r.response?.[0]]));
  const pts: (CurvePt & { last: number })[] = [];
  for (const c of contracts(def, new Date(now))) {
    const r = by.get(c.sym); if (!r) continue;
    const ts = r.timestamp ?? [], cl = r.indicators?.quote?.[0]?.close ?? [];
    const settled = ts.map((t, i) => ({ t: t * 1000, v: cl[i] })).filter((x): x is { t: number; v: number } => typeof x.v === 'number' && x.v > 0);
    if (!settled.length) continue;
    const lastS = settled[settled.length - 1];
    const trade = r.meta?.regularMarketPrice, tt = (r.meta?.regularMarketTime ?? 0) * 1000;
    const px = typeof trade === 'number' && trade > 0 && now - tt < 3 * 864e5 && tt >= lastS.t ? trade : lastS.v;
    const wk = settled.length >= 6 ? settled[settled.length - 6].v : null;
    pts.push({ sym: c.sym, label: `${MON[c.m]} ${String(c.y).slice(2)}`, px, wk, last: Math.max(lastS.t, tt) });
  }
  const newest = Math.max(0, ...pts.map((p) => p.last));
  return { key: def.key, label: def.label, unit: def.unit, dp: def.dp, pts: pts.filter((p) => newest - p.last < 4 * 864e5).map(({ last: _l, ...p }) => p) };
}
export async function fetchCurves(gapMs = 300): Promise<CurvesData> {
  const curves: Curve[] = [];
  for (const def of CURVE_DEFS) {
    const syms = contracts(def).map((c) => c.sym), res: SparkRes[] = [];
    for (let i = 0; i < syms.length; i += 12) {
      const j = await getJSON<{ spark?: { result?: SparkRes[] } }>(`${HOST.yahoo}/v7/finance/spark?symbols=${syms.slice(i, i + 12).map(encodeURIComponent).join(',')}&range=1mo&interval=1d`, { timeout: 20000 });
      res.push(...(j.spark?.result ?? []));
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
    }
    const c = curveFrom(def, res);
    if (c.pts.length >= 3) curves.push(c);
  }
  if (!curves.length) throw new Error('no futures curves from Yahoo');
  return { at: Date.now(), curves };
}
export const CURVES: SourceDef<CurvesData> = {
  id: 'yahoo:curves', label: 'Futures curves', provider: 'Yahoo Finance (CME/NYMEX/COMEX contract months)', every: 15 * 60_000,
  asOf: STATIC ? snapTime('curves.json') : undefined,
  fetch: () => (STATIC ? snap<CurvesData>('curves.json') : fetchCurves(150)),
};
/** Front, about-12-months-out, the spread between them and the curve's shape. */
export function curveStats(c: Curve) {
  const f = c.pts[0], far = c.pts.find((p, i) => i > 0 && p.label.slice(-2) !== f.label.slice(-2) && p.label.slice(0, 3) === f.label.slice(0, 3)) ?? c.pts[c.pts.length - 1];
  const spread = f && far && f !== far ? (far.px / f.px - 1) * 100 : null;
  const shape: 'contango' | 'backwardation' | 'flat' = spread == null || Math.abs(spread) < 0.5 ? 'flat' : spread > 0 ? 'contango' : 'backwardation';
  const wkFront = f?.wk ?? null;
  return { front: f, far, spread, shape, frontChg: f && wkFront ? (f.px / wkFront - 1) * 100 : null };
}

// ============================ EIA weekly inventories (EIA API v2 allows browsers; the public DEMO_KEY works)
export interface InvDef { key: string; label: string; route: string; series: string; unit: string; div: number; what: string }
export const INV_DEFS: InvDef[] = [
  { key: 'crude', label: 'Crude oil', route: 'petroleum/stoc/wstk', series: 'WCESTUS1', unit: 'M bbl', div: 1000, what: 'US commercial crude oil stocks, excluding the Strategic Petroleum Reserve' },
  { key: 'gasoline', label: 'Gasoline', route: 'petroleum/stoc/wstk', series: 'WGTSTUS1', unit: 'M bbl', div: 1000, what: 'US total motor gasoline stocks' },
  { key: 'distillate', label: 'Distillates', route: 'petroleum/stoc/wstk', series: 'WDISTUS1', unit: 'M bbl', div: 1000, what: 'US distillate fuel oil stocks (diesel and heating oil)' },
  { key: 'cushing', label: 'Cushing', route: 'petroleum/stoc/wstk', series: 'W_EPC0_SAX_YCUOK_MBBL', unit: 'M bbl', div: 1000, what: 'crude stocks at Cushing, Oklahoma, the WTI delivery hub' },
  { key: 'natgas', label: 'Natural gas', route: 'natural-gas/stor/wkly', series: 'NW2_EPG0_SWO_R48_BCF', unit: 'Bcf', div: 1, what: 'working gas in underground storage, Lower 48 states' },
];
export type InvData = Record<string, Series>;
async function eiaRoute(route: string, series: string[], start: string): Promise<{ period: string; series: string; value: string | number | null }[]> {
  const key = getKey('eia') || 'DEMO_KEY';
  const f = series.map((s) => `&facets[series][]=${encodeURIComponent(s)}`).join('');
  const j = await getJSON<{ response?: { data?: { period: string; series: string; value: string | number | null }[] }; error?: string }>(
    `https://api.eia.gov/v2/${route}/data/?api_key=${encodeURIComponent(key)}&frequency=weekly&data[0]=value${f}&start=${start}&sort[0][column]=period&sort[0][direction]=asc&length=5000`, { timeout: 20000 });
  if (!j.response?.data) throw new Error(j.error || 'EIA returned no data (the demo key allows a limited number of requests per hour)');
  return j.response.data;
}
export async function fetchInventories(): Promise<InvData> {
  const start = `${new Date().getUTCFullYear() - 6}-01-01`, out: InvData = {};
  for (const route of [...new Set(INV_DEFS.map((d) => d.route))]) {
    const defs = INV_DEFS.filter((d) => d.route === route);
    const rows = await eiaRoute(route, defs.map((d) => d.series), start);
    for (const d of defs) out[d.key] = rows.filter((r) => r.series === d.series && r.value != null && r.value !== '').map((r) => ({ d: r.period, v: Number(r.value) / d.div })).filter((o) => Number.isFinite(o.v));
  }
  return out;
}
export const INVENTORIES: SourceDef<InvData> = { id: 'eia:inventories', label: 'EIA weekly inventories', provider: 'U.S. Energy Information Administration', every: 6 * 60 * 60_000, fetch: fetchInventories };

/** Week of the year (1–53) of an ISO date, by days since 1 Jan; EIA weeks end on Fridays (gas storage on Fridays too). */
export const weekOf = (iso: string) => Math.min(52, Math.floor((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(+iso.slice(0, 4), 0, 1)) / (7 * 864e5)) + 1);
/** The latest reading against the same week in the five previous calendar years (min, max, average). */
export function fiveYear(s: Series) {
  if (!s.length) return null;
  const last = s[s.length - 1], year = +last.d.slice(0, 4);
  const band: { w: number; min: number; max: number; avg: number }[] = [];
  const by = new Map<number, number[]>();
  for (const o of s) { const y = +o.d.slice(0, 4); if (y >= year - 5 && y < year) { const w = weekOf(o.d); (by.get(w) ?? by.set(w, []).get(w)!).push(o.v); } }
  for (const [w, vs] of [...by.entries()].sort((a, b) => a[0] - b[0])) if (vs.length >= 3) band.push({ w, min: Math.min(...vs), max: Math.max(...vs), avg: vs.reduce((a, b) => a + b, 0) / vs.length });
  const cur = s.filter((o) => +o.d.slice(0, 4) === year).map((o) => ({ w: weekOf(o.d), v: o.v, d: o.d }));
  const prev = s.filter((o) => +o.d.slice(0, 4) === year - 1).map((o) => ({ w: weekOf(o.d), v: o.v }));
  const ref = band.find((b) => b.w === weekOf(last.d));
  const before = s[s.length - 2], yearAgo = s.find((o, i) => i + 1 < s.length && s[i + 1].d > `${year - 1}${last.d.slice(4)}` && o.d <= `${year - 1}${last.d.slice(4)}`);
  return { last, year, band, cur, prev, weekly: before ? last.v - before.v : null, vsAvg: ref ? last.v - ref.avg : null, vsAvgPct: ref ? (last.v / ref.avg - 1) * 100 : null,
    yoy: yearAgo ? last.v - yearAgo.v : null, ref };
}

// ============================ Long history: gold, silver, copper, WTI (weekly) + 10y real yield and broad dollar (FRED)
export interface HistData { at: number; px: Record<'gold' | 'silver' | 'copper' | 'wti', Series>; real: Series; usd: Series }
/** Week index (Monday-start weeks since 1970) of an ISO date. */
const wkIdx = (d: string) => Math.floor((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5 + 3) / 7);
/** Last observation of each week of a daily series. */
export function weekly(s: Series): Series {
  const out: Series = [];
  for (const o of s) { const p = out[out.length - 1]; if (p && wkIdx(p.d) === wkIdx(o.d)) out[out.length - 1] = o; else out.push(o); }
  return out;
}
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export async function fetchHistory(): Promise<HistData> {
  const px = {} as HistData['px'];
  for (const [k, sym] of [['gold', 'GC=F'], ['silver', 'SI=F'], ['copper', 'HG=F'], ['wti', 'CL=F']] as const) {
    const b = await chartLive(sym, '10y', '1wk');
    px[k] = weekly(b.t.map((t, i) => ({ d: iso(t), v: b.c[i] })).filter((o) => o.v > 0));
  }
  const [real, usd] = await Promise.all([fredSeries('DFII10', 3700), fredSeries('DTWEXBGS', 3700)]);
  return { at: Date.now(), px, real: weekly(real), usd: weekly(usd) };
}
export const HISTORY: SourceDef<HistData> = {
  id: 'cmdty:hist', label: 'Commodity history', provider: 'Yahoo Finance · FRED', every: 6 * 60 * 60_000,
  asOf: STATIC ? snapTime('cmdty-hist.json') : undefined,
  fetch: () => (STATIC ? snap<HistData>('cmdty-hist.json') : fetchHistory()),
};
/** Pair two weekly series by week (Yahoo dates weekly bars on Mondays, FRED's last day is usually a Friday). */
export function pair(a: Series, b: Series): { d: string; a: number; b: number }[] {
  const m = new Map(b.map((o) => [wkIdx(o.d), o.v])), out: { d: string; a: number; b: number }[] = [];
  for (const o of a) { const v = m.get(wkIdx(o.d)); if (v != null) out.push({ d: o.d, a: o.v, b: v }); }
  return out;
}
/** Pearson correlation of weekly changes over the last n weeks. */
export function changeCorr(p: { a: number; b: number }[], n = 104): number | null {
  const x = p.slice(-n - 1), da: number[] = [], db: number[] = [];
  for (let i = 1; i < x.length; i++) { da.push(x[i].a / x[i - 1].a - 1); db.push(x[i].b - x[i - 1].b); }
  if (da.length < 20) return null;
  const m = (v: number[]) => v.reduce((s, y) => s + y, 0) / v.length, ma = m(da), mb = m(db);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < da.length; i++) { sab += (da[i] - ma) * (db[i] - mb); saa += (da[i] - ma) ** 2; sbb += (db[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}
/** Where the latest value sits in the series' own range (0–100). */
export const pctile = (v: number[], x = v[v.length - 1]) => (v.length ? (v.filter((y) => y < x).length / v.length) * 100 : null);
