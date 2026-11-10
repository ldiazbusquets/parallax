import { getJSON, getText } from '@/lib/http';
import { isoDaysAgo } from '@/lib/format';
import { getKey } from '@/lib/keys';
import { HOST, snap, snapTime, STATIC } from '@/lib/env';
import { sourceFor, type SourceDef } from './store';

// ============================ U.S. Treasury auctions (fiscaldata.treasury.gov, CORS, no key)
const FISCAL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query';
export interface Auction {
  type: string; term: string; date: string; issue: string; cusip: string;
  rate: number | null; rateKind: 'yield' | 'discount' | null; btc: number | null; offering: number | null; reopening: boolean;
}
interface AuctionRow { security_type: string; security_term: string; auction_date: string; issue_date: string; cusip: string; high_yield: string | null; high_discnt_rate: string | null; high_investment_rate: string | null; bid_to_cover_ratio: string | null; offering_amt: string | null; reopening: string | null }
const n = (s: string | null | undefined) => (s == null || s === 'null' || s === '' ? null : Number(s));
export function toAuction(r: AuctionRow): Auction {
  const hy = n(r.high_yield), hd = n(r.high_discnt_rate);
  return {
    type: r.security_type, term: r.security_term, date: r.auction_date, issue: r.issue_date, cusip: r.cusip,
    rate: hy ?? n(r.high_investment_rate) ?? hd, rateKind: hy != null ? 'yield' : (n(r.high_investment_rate) ?? hd) != null ? 'discount' : null,
    btc: n(r.bid_to_cover_ratio), offering: n(r.offering_amt), reopening: r.reopening === 'Yes',
  };
}
const FIELDS = 'security_type,security_term,auction_date,issue_date,cusip,high_yield,high_discnt_rate,high_investment_rate,bid_to_cover_ratio,offering_amt,reopening';
export const AUCTIONS: SourceDef<{ results: Auction[]; upcoming: Auction[] }> = {
  id: 'treasury:auctions', label: 'Treasury auctions', provider: 'U.S. Treasury', every: 60 * 60_000,
  fetch: async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [res, up] = await Promise.all([
      getJSON<{ data: AuctionRow[] }>(`${FISCAL}?fields=${FIELDS}&filter=bid_to_cover_ratio:gt:0&sort=-auction_date&page[size]=14`),
      getJSON<{ data: AuctionRow[] }>(`${FISCAL}?fields=${FIELDS}&filter=auction_date:gte:${today}&sort=auction_date&page[size]=14`),
    ]);
    return { results: res.data.map(toAuction), upcoming: up.data.map(toAuction) };
  },
};

// ============================ CFTC Commitments of Traders (publicreporting.cftc.gov, CORS, no key)
export interface CotMarket { code: string; label: string; group: string; dataset: 'tff' | 'dis' }
export const COT_MARKETS: CotMarket[] = [
  { code: '13874+', label: 'S&P 500', group: 'Equities', dataset: 'tff' },
  { code: '20974+', label: 'Nasdaq-100', group: 'Equities', dataset: 'tff' },
  { code: '1170E1', label: 'VIX', group: 'Equities', dataset: 'tff' },
  { code: '042601', label: 'UST 2Y', group: 'Rates', dataset: 'tff' },
  { code: '043602', label: 'UST 10Y', group: 'Rates', dataset: 'tff' },
  { code: '020601', label: 'UST Bond', group: 'Rates', dataset: 'tff' },
  { code: '098662', label: 'Dollar Index', group: 'FX & crypto', dataset: 'tff' },
  { code: '099741', label: 'Euro', group: 'FX & crypto', dataset: 'tff' },
  { code: '097741', label: 'Yen', group: 'FX & crypto', dataset: 'tff' },
  { code: '096742', label: 'Pound', group: 'FX & crypto', dataset: 'tff' },
  { code: '133741', label: 'Bitcoin', group: 'FX & crypto', dataset: 'tff' },
  { code: '067651', label: 'WTI Crude', group: 'Commodities', dataset: 'dis' },
  { code: '023651', label: 'Natural Gas', group: 'Commodities', dataset: 'dis' },
  { code: '088691', label: 'Gold', group: 'Commodities', dataset: 'dis' },
  { code: '084691', label: 'Silver', group: 'Commodities', dataset: 'dis' },
  { code: '085692', label: 'Copper', group: 'Commodities', dataset: 'dis' },
  { code: '002602', label: 'Corn', group: 'Commodities', dataset: 'dis' },
  { code: '005602', label: 'Soybeans', group: 'Commodities', dataset: 'dis' },
  { code: '001602', label: 'Wheat (SRW)', group: 'Commodities', dataset: 'dis' },
];
export interface CotRow { market: CotMarket; date: string; net: number; change: number; oi: number; netPctOi: number; pctile: number | null; history: number[] }
type Raw = Record<string, string>;
/** Speculative net position: leveraged funds (financial futures) or managed money (commodities). */
export function specNet(r: Raw, ds: 'tff' | 'dis'): number {
  return ds === 'tff'
    ? Number(r.lev_money_positions_long) - Number(r.lev_money_positions_short)
    : Number(r.m_money_positions_long_all) - Number(r.m_money_positions_short_all);
}
export function cotRows(rows: Raw[], ds: 'tff' | 'dis'): CotRow[] {
  const by = new Map<string, Raw[]>();
  for (const r of rows) { const k = r.cftc_contract_market_code; if (!by.has(k)) by.set(k, []); by.get(k)!.push(r); }
  const out: CotRow[] = [];
  for (const m of COT_MARKETS.filter((x) => x.dataset === ds)) {
    const list = (by.get(m.code) || []).sort((a, b) => a.report_date_as_yyyy_mm_dd.localeCompare(b.report_date_as_yyyy_mm_dd));
    if (!list.length) continue;
    const hist = list.map((r) => specNet(r, ds));
    const cur = list[list.length - 1], net = hist[hist.length - 1], prev = hist.length > 1 ? hist[hist.length - 2] : net;
    const oi = Number(cur.open_interest_all);
    const below = hist.filter((v) => v <= net).length;
    out.push({ market: m, date: cur.report_date_as_yyyy_mm_dd.slice(0, 10), net, change: net - prev, oi, netPctOi: oi ? (net / oi) * 100 : 0, pctile: hist.length >= 20 ? Math.round(((below - 1) / (hist.length - 1)) * 100) : null, history: hist });
  }
  return out;
}
async function cotDataset(ds: 'tff' | 'dis'): Promise<CotRow[]> {
  const id = ds === 'tff' ? 'gpe5-46if' : '72hh-3qpy';
  const codes = COT_MARKETS.filter((m) => m.dataset === ds).map((m) => `'${m.code}'`).join(',');
  const cols = ds === 'tff' ? 'lev_money_positions_long,lev_money_positions_short' : 'm_money_positions_long_all,m_money_positions_short_all';
  const where = encodeURIComponent(`cftc_contract_market_code in(${codes}) AND report_date_as_yyyy_mm_dd >= '${isoDaysAgo(372)}'`);
  const rows = await getJSON<Raw[]>(`https://publicreporting.cftc.gov/resource/${id}.json?$select=cftc_contract_market_code,report_date_as_yyyy_mm_dd,open_interest_all,${cols}&$where=${where}&$limit=5000`);
  return cotRows(rows, ds);
}
export const COT: SourceDef<CotRow[]> = {
  id: 'cftc:cot', label: 'Commitments of Traders', provider: 'CFTC', every: 6 * 60 * 60_000,
  fetch: async () => { const [a, b] = await Promise.all([cotDataset('tff'), cotDataset('dis')]); return [...a, ...b]; },
};

// ============================ Crypto (CoinGecko, alternative.me, mempool.space; CORS, no key)
export interface Coin { id: string; symbol: string; name: string; price: number; mcap: number; vol: number; chg24: number | null; chg7d: number | null; spark: number[] }
export interface CryptoData { coins: Coin[]; totalMcap: number | null; mcapChg: number | null; btcDom: number | null; ethDom: number | null; fng: { value: number; label: string; history: number[] } | null; fees: { fast: number; hour: number; eco: number } | null; height: number | null }
export const CRYPTO: SourceDef<CryptoData> = {
  id: 'crypto', label: 'Crypto markets', provider: 'CoinGecko · mempool.space', every: 2 * 60_000,
  fetch: async () => {
    const [mk, gl, fg, fees, tip] = await Promise.allSettled([
      getJSON<any[]>('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=12&sparkline=true&price_change_percentage=24h,7d'),
      getJSON<{ data: any }>('https://api.coingecko.com/api/v3/global'),
      getJSON<{ data: { value: string; value_classification: string }[] }>('https://api.alternative.me/fng/?limit=30'),
      getJSON<{ fastestFee: number; hourFee: number; economyFee: number }>('https://mempool.space/api/v1/fees/recommended'),
      getText('https://mempool.space/api/blocks/tip/height'),
    ]);
    if (mk.status === 'rejected') throw mk.reason;
    const g = gl.status === 'fulfilled' ? gl.value.data : null;
    return {
      coins: mk.value.map((c) => ({ id: c.id, symbol: String(c.symbol).toUpperCase(), name: c.name, price: c.current_price, mcap: c.market_cap, vol: c.total_volume, chg24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null, chg7d: c.price_change_percentage_7d_in_currency ?? null, spark: c.sparkline_in_7d?.price ?? [] })),
      totalMcap: g?.total_market_cap?.usd ?? null, mcapChg: g?.market_cap_change_percentage_24h_usd ?? null,
      btcDom: g?.market_cap_percentage?.btc ?? null, ethDom: g?.market_cap_percentage?.eth ?? null,
      fng: fg.status === 'fulfilled' && fg.value.data?.length ? { value: Number(fg.value.data[0].value), label: fg.value.data[0].value_classification, history: fg.value.data.map((d) => Number(d.value)).reverse() } : null,
      fees: fees.status === 'fulfilled' ? { fast: fees.value.fastestFee, hour: fees.value.hourFee, eco: fees.value.economyFee } : null,
      height: tip.status === 'fulfilled' ? Number(tip.value) || null : null,
    };
  },
};

// ============================ World Bank indicators (CORS, no key), most recent non-empty value per country
export const WB_INDICATORS: { id: string; label: string; unit: string }[] = [
  { id: 'NY.GDP.MKTP.KD.ZG', label: 'Real GDP growth', unit: '%' },
  { id: 'FP.CPI.TOTL.ZG', label: 'Inflation (CPI)', unit: '%' },
  { id: 'SL.UEM.TOTL.ZS', label: 'Unemployment', unit: '%' },
  { id: 'GC.DOD.TOTL.GD.ZS', label: 'Central gov. debt', unit: '% GDP' },
  { id: 'BN.CAB.XOKA.GD.ZS', label: 'Current account', unit: '% GDP' },
  { id: 'NY.GDP.MKTP.CD', label: 'GDP', unit: 'USD' },
];
export type WbData = Record<string, Record<string, { v: number; year: string }>>;
export function worldBankSource(iso3: string[]): SourceDef<WbData> {
  return {
    id: 'worldbank', label: 'Country fundamentals', provider: 'World Bank', every: 24 * 60 * 60_000,
    fetch: async () => {
      const out: WbData = {};
      const res = await Promise.allSettled(WB_INDICATORS.map((ind) =>
        getJSON<[unknown, { countryiso3code: string; date: string; value: number | null }[] | null]>(`https://api.worldbank.org/v2/country/${iso3.join(';')}/indicator/${ind.id}?format=json&mrnev=1&per_page=200`)));
      res.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        for (const row of r.value[1] || []) {
          if (row.value == null) continue;
          (out[row.countryiso3code] ||= {})[WB_INDICATORS[i].id] = { v: row.value, year: row.date };
        }
      });
      if (!Object.keys(out).length) throw new Error('no data returned');
      return out;
    },
  };
}

// ============================ SEC EDGAR live filings feed (via /px/sec)
export interface Filing { form: string; company: string; cik: string; when: string; link: string; items: string }
export function parseEdgarAtom(xml: string): Filing[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.querySelectorAll('entry')].map((e) => {
    const title = e.querySelector('title')?.textContent || '';
    const m = title.match(/^(.+?) - (.+?) \((\d{10})\)/);
    const summary = (e.querySelector('summary')?.textContent || '').replace(/<[^>]+>/g, ' ');
    const items = (summary.match(/Item \d+\.\d+:?[^I]*/g) || []).map((s) => s.trim()).join(' · ');
    return { form: m?.[1] || e.querySelector('category')?.getAttribute('term') || '', company: m?.[2] || title, cik: m?.[3] || '', when: e.querySelector('updated')?.textContent || '', link: e.querySelector('link')?.getAttribute('href') || '', items };
  });
}
export const EDGAR_FORMS = ['8-K', '4', 'S-1', 'SCHEDULE 13D'];
export const edgarUrl = (form: string) => `${HOST.sec}/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(form)}&company=&dateb=&owner=include&start=0&count=40&output=atom`;
export const edgarSnapName = (form: string) => `sec-${form.replace(/\W+/g, '_')}.json`;
export function edgarSource(form: string): SourceDef<Filing[]> {
  return {
    id: 'sec:' + form, label: `SEC filings · ${form}`, provider: 'SEC EDGAR', every: 5 * 60_000,
    asOf: STATIC ? snapTime(edgarSnapName(form)) : undefined,
    fetch: async () => parseEdgarAtom(STATIC ? await snap<string>(edgarSnapName(form)) : await getText(edgarUrl(form))),
  };
}

// ============================ News (RSS through the relay)
export interface Headline { title: string; link: string; when: number; source: string }
export const FEEDS: { source: string; key: string; url: string }[] = [
  { source: 'CNBC', key: 'cnbc', url: `${HOST.cnbc}/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114` },
  { source: 'MarketWatch', key: 'mw', url: `${HOST.mw}/public/rss/mw_topstories` },
  { source: 'Federal Reserve', key: 'fed', url: `${HOST.fed}/feeds/press_all.xml` },
  { source: 'SEC', key: 'sec', url: `${HOST.sec}/news/pressreleases.rss` },
];
export function parseRss(xml: string, source: string): Headline[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.querySelectorAll('item, entry')].map((it) => {
    const link = it.querySelector('link');
    return {
      title: (it.querySelector('title')?.textContent || '').trim(),
      link: (link?.textContent || link?.getAttribute('href') || '').trim(),
      when: Date.parse(it.querySelector('pubDate, published, updated')?.textContent || '') || 0,
      source,
    };
  }).filter((h) => h.title);
}
export const NEWS: SourceDef<Headline[]> = {
  id: 'news', label: 'Headlines', provider: 'CNBC · MarketWatch · Fed · SEC', every: 5 * 60_000,
  asOf: STATIC ? snapTime('rss.json') : undefined,
  fetch: async () => {
    const xml: Record<string, string> = STATIC ? await snap<Record<string, string>>('rss.json') : {};
    const res = await Promise.allSettled(FEEDS.map(async (f) => {
      if (STATIC && !xml[f.key]) throw new Error(`${f.source} feed missing from snapshot`);
      return parseRss(STATIC ? xml[f.key] : await getText(f.url), f.source);
    }));
    const ok = res.filter((r): r is PromiseFulfilledResult<Headline[]> => r.status === 'fulfilled');
    if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
    const seen = new Set<string>();
    return ok.flatMap((r) => r.value).sort((a, b) => b.when - a.when).filter((h) => { const k = h.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 80);
  },
};

// Headline tone: a transparent word-count score, not a model. +1 for each "positive" word, -1 for each "negative".
const POS = ['surge', 'surges', 'rally', 'rallies', 'gain', 'gains', 'jump', 'jumps', 'beat', 'beats', 'record', 'rise', 'rises', 'soar', 'soars', 'upgrade', 'strong', 'growth', 'boost', 'rebound', 'cools', 'eases', 'optimism', 'tops', 'climbs', 'higher'];
const NEG = ['plunge', 'plunges', 'fall', 'falls', 'drop', 'drops', 'slump', 'slumps', 'miss', 'misses', 'cut', 'cuts', 'fear', 'fears', 'recession', 'crash', 'tumble', 'tumbles', 'downgrade', 'weak', 'loss', 'losses', 'selloff', 'sell-off', 'warns', 'risk', 'slides', 'lower', 'tariff', 'tariffs', 'layoffs', 'default', 'crisis'];
export function tone(title: string): number {
  const w = title.toLowerCase().match(/[a-z-]+/g) || [];
  let s = 0;
  for (const x of w) { if (POS.includes(x)) s++; else if (NEG.includes(x)) s--; }
  return Math.max(-1, Math.min(1, s));
}

// ============================ Finnhub (optional key; CORS)
const FH = 'https://finnhub.io/api/v1';
export interface EarningsEvent { symbol: string; date: string; hour: string; epsEst: number | null; epsAct: number | null; revEst: number | null; revAct: number | null }
export interface IpoEvent { symbol: string; name: string; date: string; exchange: string; price: string; shares: number | null; status: string }
export async function finnhubEarnings(key: string): Promise<{ upcoming: EarningsEvent[]; reported: EarningsEvent[] }> {
  const from = isoDaysAgo(7), to = isoDaysAgo(-7);
  const j = await getJSON<{ earningsCalendar: any[] }>(`${FH}/calendar/earnings?from=${from}&to=${to}&token=${key}`);
  const all: EarningsEvent[] = (j.earningsCalendar || []).map((e) => ({ symbol: e.symbol, date: e.date, hour: e.hour, epsEst: e.epsEstimate ?? null, epsAct: e.epsActual ?? null, revEst: e.revenueEstimate ?? null, revAct: e.revenueActual ?? null }));
  const today = new Date().toISOString().slice(0, 10);
  return {
    upcoming: all.filter((e) => e.date >= today && e.epsAct == null).sort((a, b) => a.date.localeCompare(b.date) || (b.revEst ?? 0) - (a.revEst ?? 0)),
    reported: all.filter((e) => e.epsAct != null && e.epsEst != null).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

// ---- earnings season: beat rate over the last ~13 weeks (a full reporting season)
export interface SeasonStat { n: number; beat: number; miss: number; inline: number; beatPct: number | null; medianSurprise: number | null; revN: number; revBeat: number }
export interface SeasonData { from: string; to: string; all: SeasonStat; large: SeasonStat; largeN: number; weeks: { wk: string; n: number; beat: number }[]; beats: EarningsEvent[]; misses: EarningsEvent[] }
export const surprisePct = (e: EarningsEvent) => (e.epsAct != null && e.epsEst != null && Math.abs(e.epsEst) >= 0.01 ? ((e.epsAct - e.epsEst) / Math.abs(e.epsEst)) * 100 : null);
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function stat(rows: EarningsEvent[]): SeasonStat {
  const r = rows.filter((e) => e.epsAct != null && e.epsEst != null);
  const beat = r.filter((e) => e.epsAct! > e.epsEst!).length, miss = r.filter((e) => e.epsAct! < e.epsEst!).length;
  const rev = r.filter((e) => e.revAct != null && e.revEst != null && e.revEst > 0);
  return { n: r.length, beat, miss, inline: r.length - beat - miss, beatPct: r.length ? (beat / r.length) * 100 : null, medianSurprise: median(r.map(surprisePct).filter((x): x is number => x != null)), revN: rev.length, revBeat: rev.filter((e) => e.revAct! > e.revEst!).length };
}
/** Monday of the week (UTC) a date falls in. */
const weekOf = (d: string) => { const t = new Date(d + 'T00:00:00Z'), k = (t.getUTCDay() + 6) % 7; return new Date(t.getTime() - k * 864e5).toISOString().slice(0, 10); };
/** Beat rate for every reporter and for the largest companies (`large`, Nasdaq-style symbols compared without punctuation). */
export function seasonStats(rows: EarningsEvent[], large: Set<string>, from: string, to: string): SeasonData {
  const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const seen = new Set<string>(), uniq: EarningsEvent[] = [];
  for (const e of rows) { const k = e.symbol + e.date; if (!seen.has(k) && e.epsAct != null && e.epsEst != null) { seen.add(k); uniq.push(e); } }
  const big = uniq.filter((e) => large.has(key(e.symbol)));
  const wk = new Map<string, { n: number; beat: number }>();
  for (const e of big) { const w = weekOf(e.date), x = wk.get(w) ?? { n: 0, beat: 0 }; x.n++; if (e.epsAct! > e.epsEst!) x.beat++; wk.set(w, x); }
  // a tiny estimate (a few cents) turns any miss into ±1,000%: rank only estimates of 10¢ or more
  const bySurprise = big.filter((e) => surprisePct(e) != null && Math.abs(e.epsEst!) >= 0.1).sort((a, b) => surprisePct(b)! - surprisePct(a)!);
  return {
    from, to, all: stat(uniq), large: stat(big), largeN: large.size,
    weeks: [...wk.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([w, x]) => ({ wk: w, ...x })),
    beats: bySurprise.slice(0, 8), misses: bySurprise.slice(-8).reverse(),
  };
}
export async function finnhubSeason(key: string, large: Set<string>, days = 91): Promise<SeasonData> {
  const rows: EarningsEvent[] = [];
  for (let back = days; back > 0; back -= 14) { // two weeks per call keeps each answer under the free tier's row cap
    const j = await getJSON<{ earningsCalendar: any[] }>(`${FH}/calendar/earnings?from=${isoDaysAgo(back)}&to=${isoDaysAgo(Math.max(0, back - 13))}&token=${key}`);
    for (const e of j.earningsCalendar || []) rows.push({ symbol: e.symbol, date: e.date, hour: e.hour, epsEst: e.epsEstimate ?? null, epsAct: e.epsActual ?? null, revEst: e.revenueEstimate ?? null, revAct: e.revenueActual ?? null });
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (!rows.length) throw new Error('no earnings rows');
  return seasonStats(rows, large, isoDaysAgo(days), isoDaysAgo(0));
}
export const SEASON: SourceDef<SeasonData> = {
  id: 'finnhub:season', label: 'Earnings season', provider: 'Finnhub', every: 6 * 60 * 60_000,
  asOf: snapTime('season.json'),
  fetch: () => snap<SeasonData>('season.json'),
};
export async function finnhubIpos(key: string): Promise<IpoEvent[]> {
  const j = await getJSON<{ ipoCalendar: any[] }>(`${FH}/calendar/ipo?from=${isoDaysAgo(14)}&to=${isoDaysAgo(-30)}&token=${key}`);
  return (j.ipoCalendar || []).map((e) => ({ symbol: e.symbol || '', name: e.name, date: e.date, exchange: e.exchange || '', price: e.price || '', shares: e.numberOfShares ?? null, status: e.status || '' })).sort((a, b) => b.date.localeCompare(a.date));
}
/** On the website the GitHub job publishes the calendars (its key stays secret); a visitor's own key is the fallback. */
async function viaSiteOrKey<T>(file: string, live: (k: string) => Promise<T>): Promise<T> {
  if (STATIC) {
    try { return await snap<T>(file); } catch { /* not published: fall through to the visitor's key */ }
  }
  const k = getKey('finnhub');
  if (!k) throw new Error('Add a free Finnhub key in Settings');
  return live(k);
}
export const EARNINGS: SourceDef<{ upcoming: EarningsEvent[]; reported: EarningsEvent[] }> = {
  id: 'finnhub:earnings', label: 'Earnings calendar', provider: 'Finnhub', every: 60 * 60_000, requires: STATIC ? undefined : 'finnhub',
  asOf: STATIC ? snapTime('earnings.json') : undefined,
  fetch: () => viaSiteOrKey('earnings.json', finnhubEarnings),
};
export const IPOS: SourceDef<IpoEvent[]> = {
  id: 'finnhub:ipo', label: 'IPO calendar', provider: 'Finnhub', every: 6 * 60 * 60_000, requires: STATIC ? undefined : 'finnhub',
  asOf: STATIC ? snapTime('ipo.json') : undefined,
  fetch: () => viaSiteOrKey('ipo.json', finnhubIpos),
};

// ============================ Groq (optional key) for the written brief
export interface PublishedBrief { text: string; at: number; model: string }
export const BRIEF: SourceDef<PublishedBrief> = {
  id: 'brief', label: 'Morning brief', provider: 'Groq · gpt-oss-120b', every: 15 * 60_000,
  asOf: snapTime('brief.json'),
  fetch: () => snap<PublishedBrief>('brief.json'),
};
// Groq retired llama-3.3-70b-versatile on 2026-08-16; gpt-oss-120b is their recommended replacement.
export const GROQ_MODEL = 'openai/gpt-oss-120b';
export async function groqBrief(prompt: string, key = getKey('groq')): Promise<string> {
  if (!key) throw new Error('Add a Groq key in Settings');
  const res = await getJSON<{ choices: { message: { content: string } }[] }>('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', timeout: 45000,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL, temperature: 0.2, max_tokens: 2000, reasoning_effort: 'low', // reasoning tokens count toward max_tokens
      messages: [
        { role: 'system', content: 'You are a sell-side strategist writing a concise morning market brief. Use ONLY the numbers in the data provided; never invent figures, events or causes. If something is not in the data, do not mention it. Plain text, 5 short sections with headers: Overview, Equities, Rates & Fed, Commodities & FX, What to watch. Under 260 words.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  return res.choices?.[0]?.message?.content?.trim() || 'No text returned.';
}

// ---------------------------------------------------------------- central bank policy rates (BIS)
// BIS "Central bank policy rates" dataset (WS_CBPOL), daily, ~40 economies; euro area is XM.
// No CORS, so dev goes through /px/bis and the website reads the snapshot.
export interface PolicyRate { area: string; v: number; d: string; prev?: number; changed?: string; y1?: number }
export function parseBisPolicy(csv: string, yearAgo = isoDaysAgo(365)): Record<string, PolicyRate> {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0]?.split(',') ?? [];
  const ia = head.indexOf('REF_AREA'), it = head.indexOf('TIME_PERIOD'), iv = head.indexOf('OBS_VALUE');
  if (ia < 0 || it < 0 || iv < 0) throw new Error('unexpected BIS format');
  const by: Record<string, { d: string; v: number }[]> = {};
  for (const l of lines.slice(1)) {
    const c = l.split(','), v = parseFloat(c[iv]);
    if (Number.isFinite(v) && c[it]) (by[c[ia]] ??= []).push({ d: c[it], v });
  }
  const out: Record<string, PolicyRate> = {};
  for (const [area, s] of Object.entries(by)) {
    s.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
    const last = s[s.length - 1];
    let k = s.length - 1;
    while (k > 0 && s[k - 1].v === last.v) k--;
    const y = [...s].reverse().find((o) => o.d <= yearAgo);
    out[area] = { area, v: last.v, d: last.d, prev: k > 0 ? s[k - 1].v : undefined, changed: k > 0 ? s[k].d : undefined, y1: y?.v };
  }
  return out;
}
export async function bisPolicy(): Promise<Record<string, PolicyRate>> {
  const csv = await getText(`${HOST.bis}/api/v1/data/WS_CBPOL/D./all?startPeriod=${isoDaysAgo(400)}&detail=dataonly`, { headers: { Accept: 'application/vnd.sdmx.data+csv;version=1.0.0' }, timeout: 45000 });
  const out = parseBisPolicy(csv);
  if (!Object.keys(out).length) throw new Error('no policy rates returned');
  return out;
}
export const POLICY: SourceDef<Record<string, PolicyRate>> = {
  id: 'bis:policy', label: 'Policy rates', provider: 'BIS', every: 6 * 60 * 60_000,
  asOf: STATIC ? snapTime('bis.json') : undefined,
  fetch: () => (STATIC ? snap<Record<string, PolicyRate>>('bis.json') : bisPolicy()),
};

// ---------------------------------------------------------------- IMF World Economic Outlook (DataMapper API)
// ~229 economies, actuals plus IMF projections; updated each April and October. No CORS: relay / snapshot.
export const IMF_INDICATORS: { id: string; label: string; short: string; unit: '%' | '% GDP' | 'USD bn' | 'USD' }[] = [
  { id: 'NGDP_RPCH', label: 'Real GDP growth', short: 'GDP', unit: '%' },
  { id: 'PCPIPCH', label: 'Inflation', short: 'CPI', unit: '%' },
  { id: 'LUR', label: 'Unemployment', short: 'Unemp.', unit: '%' },
  { id: 'GGXCNL_NGDP', label: 'Fiscal balance', short: 'Fiscal', unit: '% GDP' },
  { id: 'GGXWDG_NGDP', label: 'Government debt', short: 'Debt', unit: '% GDP' },
  { id: 'BCA_NGDPD', label: 'Current account', short: 'C/A', unit: '% GDP' },
  { id: 'NGDPD', label: 'GDP', short: 'GDP $', unit: 'USD bn' },
  { id: 'NGDPDPC', label: 'GDP per capita', short: 'Per cap.', unit: 'USD' },
];
/** { edition, years, data: { ISO3: { indicatorId: { year: value } } } } */
export interface ImfData { edition: string; years: number[]; data: Record<string, Record<string, Record<string, number>>>; saved?: string }
export function shapeImf(raw: Record<string, Record<string, Record<string, number | null>>>, years: number[], edition: string): ImfData {
  const data: ImfData['data'] = {};
  for (const [ind, byCountry] of Object.entries(raw)) {
    for (const [iso, series] of Object.entries(byCountry ?? {})) {
      for (const y of years) {
        const v = series?.[String(y)];
        if (typeof v === 'number' && Number.isFinite(v)) ((data[iso] ||= {})[ind] ||= {})[String(y)] = v;
      }
    }
  }
  return { edition, years, data };
}
export async function imfWeo(): Promise<ImfData> {
  const y = new Date().getFullYear(), years = [y - 2, y - 1, y, y + 1, y + 2];
  const raw: Record<string, Record<string, Record<string, number | null>>> = {};
  for (const ind of IMF_INDICATORS) {
    const j = await getJSON<{ values?: Record<string, Record<string, Record<string, number | null>>> }>(`${HOST.imf}/external/datamapper/api/v1/${ind.id}`, { timeout: 30000 });
    if (j.values?.[ind.id]) raw[ind.id] = j.values[ind.id];
  }
  if (!Object.keys(raw).length) throw new Error('no IMF data returned');
  let edition = 'World Economic Outlook';
  try {
    const meta = await getJSON<{ indicators?: Record<string, { source?: string }> }>(`${HOST.imf}/external/datamapper/api/v1/indicators`, { timeout: 30000 });
    edition = meta.indicators?.NGDP_RPCH?.source || edition;
  } catch { /* label only */ }
  return shapeImf(raw, years, edition);
}
export const IMF: SourceDef<ImfData> = {
  id: 'imf:weo', label: 'IMF outlook', provider: 'IMF WEO', every: 12 * 60 * 60_000,
  asOf: STATIC ? snapTime('imf.json') : undefined,
  fetch: () => (STATIC ? snap<ImfData>('imf.json') : imfWeo()),
};

// ---------------------------------------------------------------- company news (Finnhub)
export interface NewsItem { t: number; headline: string; source: string; url: string; summary: string }
export async function finnhubCompanyNews(symbol: string, key: string): Promise<NewsItem[]> {
  const j = await getJSON<{ datetime: number; headline: string; source: string; url: string; summary?: string }[]>(`${FH}/company-news?symbol=${encodeURIComponent(symbol)}&from=${isoDaysAgo(10)}&to=${isoDaysAgo(0)}&token=${key}`);
  const seen = new Set<string>();
  return (Array.isArray(j) ? j : [])
    .filter((n) => n.headline && n.url && !seen.has(n.headline) && (seen.add(n.headline), true))
    .sort((a, b) => b.datetime - a.datetime).slice(0, 15)
    .map((n) => ({ t: n.datetime * 1000, headline: n.headline, source: n.source, url: n.url, summary: (n.summary || '').slice(0, 280) }));
}
/** News for one company: the website's snapshot for tracked companies, otherwise the visitor's Finnhub key. */
export const companyNewsSource = (t: string) => sourceFor<NewsItem[]>('news:' + t, () => ({
  id: 'news:' + t, label: `${t} news`, provider: 'Finnhub', every: 30 * 60_000,
  asOf: STATIC ? snapTime('conews.json') : undefined,
  fetch: async () => {
    if (STATIC) { try { const all = await snap<Record<string, NewsItem[]>>('conews.json'); if (all[t]) return all[t]; } catch { /* fall through */ } }
    const k = getKey('finnhub');
    if (!k) throw new Error(STATIC ? 'not in the site snapshot; add a free Finnhub key in Settings' : 'Add a free Finnhub key in Settings');
    return finnhubCompanyNews(t, k);
  },
}));
