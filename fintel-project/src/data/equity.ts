import { getJSON, getText } from '@/lib/http';
import { isoDaysAgo } from '@/lib/format';
import { getKey } from '@/lib/keys';
import { HOST, snap, snapTime, STATIC } from '@/lib/env';
import { sourceFor, type SourceDef } from './store';
import { DEFAULT_WATCHLIST, HEATMAP } from './universe';
import { sparkLive, type Quote } from './yahoo';

// Phase 3 sources: a whole-market stock screener, analyst recommendation trends, and short interest.

/** Companies the website builds pages for (and the snapshot job tracks). */
export const TRACKED = [...new Set([...HEATMAP.flatMap((g) => g.items), ...DEFAULT_WATCHLIST])].filter((t) => !['SPY', 'QQQ', 'TLT'].includes(t));

// ============================ Screener: every US-listed stock (Nasdaq's public screener, no key, no CORS)
/** `t` (ms) is set when price and change come from a Yahoo quote rather than Nasdaq's screener file (which can lag a session or two). */
export interface ScreenRow { s: string; n: string; p: number; ch: number | null; mc: number | null; v: number | null; sec: string; ind: string; cty: string; t?: number }
const numOr = (x: unknown) => { const v = Number(String(x ?? '').replace(/[$,%\s]/g, '')); return String(x ?? '').trim() && Number.isFinite(v) ? v : null; };
/** Clean company names: "Agilent Technologies Inc. Common Stock" → "Agilent Technologies Inc." */
const tidyName = (n: string) => n.replace(/\s+(Common Stock|Class [A-C] Common Stock|Ordinary Shares|American Depositary Shares?|ADS)\b.*$/i, '').trim();
export function parseNasdaqScreener(j: { data?: { rows?: Record<string, unknown>[] | null } }): ScreenRow[] {
  const rows = j?.data?.rows;
  if (!Array.isArray(rows)) throw new Error('screener: unexpected format');
  const out: ScreenRow[] = [];
  for (const r of rows) {
    const p = numOr(r.lastsale), s = String(r.symbol ?? '').trim();
    if (!s || !p || p <= 0) continue;
    out.push({ s, n: tidyName(String(r.name ?? s)), p, ch: numOr(r.pctchange), mc: numOr(r.marketCap) || null, v: numOr(r.volume), sec: String(r.sector ?? '').trim(), ind: String(r.industry ?? '').trim(), cty: String(r.country ?? '').trim() });
  }
  return out;
}
export async function nasdaqScreener(): Promise<ScreenRow[]> {
  const rows = parseNasdaqScreener(await getJSON(`${HOST.nasdaq}/api/screener/stocks?tableonly=true&download=true`, { timeout: 45000 }));
  if (rows.length < 1000) throw new Error(`only ${rows.length} stocks returned`);
  return rows;
}

// ---- the largest US-listed companies, one entry per company (used by the heatmap and the site's company pages)
export const NOT_COMMON = /depositary shares? represent|preferred|\bnotes?\b|debentures?|%|warrants?|\bunits?\b|\brights\b/i;
/** Nasdaq leaves a few large companies without a sector. */
export const SECTOR_FIX: Record<string, string> = { 'BRK/A': 'Finance', 'BRK/B': 'Finance' };
/** Share classes of one company share a key ("Alphabet Inc. Class A" = "Alphabet Inc. Class C"). */
export const companyKey = (name: string) => name.replace(/\s+(class [a-z]\b|capital stock|common stock|ordinary shares).*$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** The n largest companies by market value; share classes are merged (the first, most valuable class stands for the company). */
export function topCompanies(rows: ScreenRow[], n: number, needChange = false): ScreenRow[] {
  const seen = new Set<string>(), out: ScreenRow[] = [];
  for (const r of [...rows].filter((r) => r.mc != null && r.mc > 0 && (!needChange || r.ch != null) && !NOT_COMMON.test(r.n)).sort((a, b) => b.mc! - a.mc!)) {
    const k = companyKey(r.n);
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
    if (out.length >= n) break;
  }
  return out;
}
/** How many of the largest companies the website builds full pages for (on top of TRACKED). */
export const WIDE_N = 500;
/** Yahoo and SEC write share classes with a dash (BRK-B); Nasdaq uses a slash (BRK/B). */
export const dashSym = (s: string) => s.replace(/[/.]/g, '-');

/** Nasdaq's screener download can be a session or two behind (on Nov 11, 2026 it still had Nov 9's prices), so the
 *  largest companies get price and day change from Yahoo quotes; market value is rescaled to the new price. */
export function freshenRows(rows: ScreenRow[], quotes: Record<string, Quote>): ScreenRow[] {
  return rows.map((r) => {
    const q = quotes[dashSym(r.s)];
    if (!q || !Number.isFinite(q.price) || q.changePct == null) return r;
    return { ...r, p: q.price, ch: q.changePct, mc: r.mc != null && r.p > 0 ? (r.mc * q.price) / r.p : r.mc, t: q.time };
  });
}
export async function nasdaqScreenerFresh(n = 600): Promise<ScreenRow[]> {
  const rows = await nasdaqScreener();
  const syms = [...new Set([...topCompanies(rows, n).map((r) => r.s), ...TRACKED])].map(dashSym);
  const q = await sparkLive(syms, '1d', '5m').catch(() => ({} as Record<string, Quote>));
  return freshenRows(rows, q);
}

export const SCREENER: SourceDef<ScreenRow[]> = {
  id: 'nasdaq:screener', label: 'Stock screener', provider: 'Nasdaq', every: 30 * 60_000,
  asOf: STATIC ? snapTime('screener.json') : undefined,
  fetch: () => (STATIC ? snap<ScreenRow[]>('screener.json') : nasdaqScreenerFresh()),
};

// ============================ Analyst recommendation trends (Finnhub, free tier)
export interface Rec { period: string; sb: number; b: number; h: number; s: number; ss: number }
export async function finnhubRecs(sym: string, key: string): Promise<Rec[]> {
  const j = await getJSON<{ period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[]>(`https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(sym)}&token=${key}`);
  if (!Array.isArray(j)) throw new Error('unexpected response');
  return j.map((r) => ({ period: r.period, sb: r.strongBuy ?? 0, b: r.buy ?? 0, h: r.hold ?? 0, s: r.sell ?? 0, ss: r.strongSell ?? 0 }))
    .sort((a, b) => b.period.localeCompare(a.period)).slice(0, 6);
}
/** 1 (strong buy) … 5 (strong sell), the usual consensus scale. */
export function recScore(r?: Rec): number | null {
  if (!r) return null;
  const n = r.sb + r.b + r.h + r.s + r.ss;
  return n ? (r.sb * 1 + r.b * 2 + r.h * 3 + r.s * 4 + r.ss * 5) / n : null;
}
export const recLabel = (x: number | null) => (x == null ? '—' : x <= 1.5 ? 'Strong buy' : x <= 2.5 ? 'Buy' : x <= 3.5 ? 'Hold' : x <= 4.5 ? 'Sell' : 'Strong sell');
export const RATINGS: SourceDef<Record<string, Rec[]>> = {
  id: 'finnhub:ratings', label: 'Analyst ratings', provider: 'Finnhub', every: 6 * 60 * 60_000,
  asOf: STATIC ? snapTime('ratings.json') : undefined,
  // the website publishes the tracked companies' ratings; locally they load per company with a key
  fetch: async () => (STATIC ? snap<Record<string, Rec[]>>('ratings.json') : {}),
};
export const ratingSource = (t: string) => sourceFor<Rec[]>('ratings:' + t, () => ({
  id: 'ratings:' + t, label: `${t} analyst ratings`, provider: 'Finnhub', every: 6 * 60 * 60_000,
  requires: STATIC ? undefined : 'finnhub',
  asOf: STATIC ? snapTime('ratings.json') : undefined,
  fetch: async () => {
    if (STATIC) { const all = await snap<Record<string, Rec[]>>('ratings.json'); if (all[t]) return all[t]; }
    const k = getKey('finnhub');
    if (!k) throw new Error(STATIC ? 'not tracked on the website; add a Finnhub key in Settings' : 'Add a free Finnhub key in Settings');
    return finnhubRecs(t, k);
  },
}));

// ============================ Short interest (FINRA, twice a month; no key, no CORS)
export interface ShortInt { date: string; short: number; prev: number | null; chgPct: number | null; adv: number | null; dtc: number | null }
type FinraRow = Record<string, unknown>;
/** Keep each symbol's latest settlement; FINRA reports by market, so the same symbol/date is summed. */
export function shapeShortInterest(rows: FinraRow[]): Record<string, ShortInt> {
  const by = new Map<string, Map<string, { short: number; prev: number; adv: number }>>();
  for (const r of rows) {
    const s = String(r.symbolCode ?? ''), d = String(r.settlementDate ?? '').slice(0, 10), q = Number(r.currentShortPositionQuantity);
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(q)) continue;
    const m = by.get(s) ?? new Map(); by.set(s, m);
    const x = m.get(d) ?? { short: 0, prev: 0, adv: 0 };
    x.short += q; x.prev += Number(r.previousShortPositionQuantity) || 0; x.adv += Number(r.averageDailyVolumeQuantity) || 0;
    m.set(d, x);
  }
  const out: Record<string, ShortInt> = {};
  for (const [s, m] of by) {
    const d = [...m.keys()].sort().pop()!, x = m.get(d)!;
    out[s] = { date: d, short: x.short, prev: x.prev || null, chgPct: x.prev ? (x.short / x.prev - 1) * 100 : null, adv: x.adv || null, dtc: x.adv ? x.short / x.adv : null };
  }
  return out;
}
export async function finraShortInterest(symbols: string[]): Promise<Record<string, ShortInt>> {
  const body = {
    limit: 5000,
    fields: ['symbolCode', 'settlementDate', 'currentShortPositionQuantity', 'previousShortPositionQuantity', 'averageDailyVolumeQuantity'],
    domainFilters: [{ fieldName: 'symbolCode', values: symbols }],
    dateRangeFilters: [{ fieldName: 'settlementDate', startDate: isoDaysAgo(45), endDate: isoDaysAgo(0) }],
  };
  const txt = await getText(`${HOST.finra}/data/group/otcMarket/name/consolidatedShortInterest`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: 30000 });
  let rows: FinraRow[];
  try { rows = JSON.parse(txt); } catch { throw new Error('FINRA: unexpected response'); }
  if (!Array.isArray(rows)) throw new Error('FINRA: unexpected response');
  const out = shapeShortInterest(rows);
  if (!Object.keys(out).length) throw new Error('FINRA returned no short interest');
  return out;
}
export const SHORTS: SourceDef<Record<string, ShortInt>> = {
  id: 'finra:shorts', label: 'Short interest', provider: 'FINRA', every: 6 * 60 * 60_000,
  asOf: STATIC ? snapTime('shorts.json') : undefined,
  fetch: () => (STATIC ? snap<Record<string, ShortInt>>('shorts.json') : finraShortInterest(TRACKED)),
};

// ============================ Daily short-sale volume (FINRA Reg SHO files, CORS, live everywhere)
export interface ShortVol { date: string; rows: Record<string, [number, number]> } // symbol → [short volume, total volume]
export function parseShortVolume(txt: string): ShortVol {
  const L = txt.split(/\r?\n/);
  if (!/^Date\|Symbol\|ShortVolume\|ShortExemptVolume\|TotalVolume/.test(L[0] ?? '')) throw new Error('short volume: unexpected format');
  const rows: ShortVol['rows'] = {};
  let date = '';
  for (const l of L.slice(1)) {
    const c = l.split('|');
    if (c.length < 5) continue;
    const sv = Number(c[2]), tv = Number(c[4]);
    if (!c[1] || !Number.isFinite(sv) || !Number.isFinite(tv) || tv <= 0) continue;
    date = c[0]; rows[c[1]] = [sv, tv];
  }
  if (!date) throw new Error('short volume file is empty');
  return { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, rows };
}
export async function latestShortVolume(now = new Date()): Promise<ShortVol> {
  let last: unknown;
  for (let back = 0; back < 8; back++) {
    const d = new Date(now.getTime() - back * 864e5);
    if ([0, 6].includes(d.getUTCDay())) continue;
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    try { return parseShortVolume(await getText(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${ymd}.txt`, { timeout: 20000 })); } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : new Error('no recent short volume file');
}
export const SHORT_VOL: SourceDef<ShortVol> = {
  id: 'finra:shortvol', label: 'Daily short volume', provider: 'FINRA Reg SHO', every: 3 * 60 * 60_000,
  fetch: () => latestShortVolume(),
};
