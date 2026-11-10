import { getJSON, getText } from '@/lib/http';
import { HOST, snap, snapTime } from '@/lib/env';
import type { SourceDef } from './store';

// Phase 4: what well-known funds own (their latest Form 13F), from SEC EDGAR. 13F lists positions by CUSIP;
// the snapshot job maps CUSIPs to tickers with OpenFIGI (Bloomberg's free identifier service) and keeps the map
// between runs. Positions are as of the quarter end and filed up to 45 days later.

export interface FundDef { cik: string; name: string; match: RegExp; style: 'activist' | 'value' | 'macro' | 'growth' }
/** Concentrated, closely watched managers. `match` guards against a wrong CIK (the filer name must match). */
export const FUNDS: FundDef[] = [
  { cik: '1067983', name: 'Berkshire Hathaway', match: /berkshire/i, style: 'value' },
  { cik: '1336528', name: 'Pershing Square', match: /pershing/i, style: 'activist' },
  { cik: '1649339', name: 'Scion Asset Management', match: /scion/i, style: 'value' },
  { cik: '1350694', name: 'Bridgewater Associates', match: /bridgewater/i, style: 'macro' },
  { cik: '1040273', name: 'Third Point', match: /third point/i, style: 'activist' },
  { cik: '1656456', name: 'Appaloosa', match: /appaloosa/i, style: 'value' },
  { cik: '1167483', name: 'Tiger Global', match: /tiger global/i, style: 'growth' },
  { cik: '1135730', name: 'Coatue', match: /coatue/i, style: 'growth' },
  { cik: '1061768', name: 'Baupost Group', match: /baupost/i, style: 'value' },
  { cik: '1079114', name: 'Greenlight Capital', match: /greenlight/i, style: 'value' },
  { cik: '921669', name: 'Icahn Enterprises (Carl Icahn)', match: /icahn/i, style: 'activist' },
  { cik: '1536411', name: 'Duquesne Family Office', match: /duquesne/i, style: 'macro' },
  { cik: '1029160', name: 'Soros Fund Management', match: /soros/i, style: 'macro' },
  { cik: '1061165', name: 'Lone Pine Capital', match: /lone pine/i, style: 'growth' },
  { cik: '1103804', name: 'Viking Global', match: /viking/i, style: 'growth' },
  { cik: '1418814', name: 'ValueAct', match: /valueact/i, style: 'activist' },
  { cik: '1791786', name: 'Elliott Investment Management', match: /elliott/i, style: 'activist' },
  { cik: '1517137', name: 'Starboard Value', match: /starboard/i, style: 'activist' },
  { cik: '1345471', name: 'Trian Fund Management', match: /trian/i, style: 'activist' },
  { cik: '1697748', name: 'ARK Investment Management', match: /\bark\b/i, style: 'growth' },
];

export interface Holding { cusip: string; issuer: string; t: string | null; value: number; shares: number; pct: number }
export interface Fund { cik: string; name: string; style: FundDef['style']; period: string; filed: string; total: number; positions: number; holdings: Holding[]; link: string }
export interface FundsData { funds: Fund[]; errors: string[]; v?: number }
/** Bumped when the way funds.json is built changes, so the job rebuilds it at once instead of waiting a day. */
export const FUNDS_V = 3;

const tag = (x: string, t: string) => x.match(new RegExp(`<(?:\\w+:)?${t}>\\s*([^<]*)<`, 'i'))?.[1].trim() ?? '';
/** Sum an information table by CUSIP (one company can be listed under several managers); options are left out. */
export function parseInfoTable(xml: string): Omit<Holding, 't' | 'pct'>[] {
  const by = new Map<string, Omit<Holding, 't' | 'pct'>>();
  for (const b of xml.match(/<(?:\w+:)?infoTable>[\s\S]*?<\/(?:\w+:)?infoTable>/gi) ?? []) {
    if (tag(b, 'putCall')) continue;
    if (tag(b, 'sshPrnamtType') && tag(b, 'sshPrnamtType') !== 'SH') continue;
    const cusip = tag(b, 'cusip').toUpperCase(), value = Number(tag(b, 'value')), shares = Number(tag(b, 'sshPrnamt'));
    if (!cusip || !Number.isFinite(value)) continue;
    const e = by.get(cusip) ?? { cusip, issuer: tag(b, 'nameOfIssuer'), value: 0, shares: 0 };
    e.value += value; e.shares += Number.isFinite(shares) ? shares : 0;
    by.set(cusip, e);
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}
/** Value as a share of the portfolio, tickers from the CUSIP map, top `keep` positions. */
export function shapeHoldings(rows: Omit<Holding, 't' | 'pct'>[], tickers: Record<string, string | null>, keep = 40): { total: number; holdings: Holding[] } {
  const total = rows.reduce((a, r) => a + r.value, 0);
  return { total, holdings: rows.slice(0, keep).map((r) => ({ ...r, t: tickers[r.cusip] ?? null, pct: total ? (r.value / total) * 100 : 0 })) };
}

interface Sub { name: string; filings: { recent: { form: string[]; accessionNumber: string[]; filingDate: string[]; reportDate: string[] } } }
/** The latest 13F-HR's information table, raw (CUSIP → ticker happens afterwards). */
export async function latest13F(def: FundDef) {
  const s = await getJSON<Sub>(`${HOST.secdata}/submissions/CIK${def.cik.padStart(10, '0')}.json`);
  if (!def.match.test(s.name)) throw new Error(`CIK ${def.cik} is "${s.name}", not ${def.name}`);
  const r = s.filings.recent, i = r.form.findIndex((f) => f === '13F-HR');
  if (i < 0) throw new Error('no 13F-HR on file');
  const dir = `${HOST.sec}/Archives/edgar/data/${Number(def.cik)}/${r.accessionNumber[i].replace(/-/g, '')}`;
  const idx = await getJSON<{ directory: { item: { name: string }[] } }>(`${dir}/index.json`);
  const file = idx.directory.item.map((x) => x.name).find((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n));
  if (!file) throw new Error('no information table');
  const rows = parseInfoTable(await getText(`${dir}/${file}`));
  return { period: r.reportDate[i], filed: r.filingDate[i], rows, link: `https://www.sec.gov/Archives/edgar/data/${Number(def.cik)}/${r.accessionNumber[i].replace(/-/g, '')}/` };
}

/** OpenFIGI (no key: 10 identifiers per request, 25 requests a minute). US-listed equity tickers only. */
export async function figiTickers(cusips: string[], gapMs = 2600): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < cusips.length; i += 10) {
    const batch = cusips.slice(i, i + 10);
    const res = await getJSON<{ data?: { ticker: string; securityType2?: string; marketSector?: string }[]; warning?: string }[]>('https://api.openfigi.com/v3/mapping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 20000,
      body: JSON.stringify(batch.map((c) => ({ idType: 'ID_CUSIP', idValue: c, exchCode: 'US' }))),
    });
    batch.forEach((c, k) => { const d = res[k]?.data?.find((x) => x.marketSector === 'Equity') ?? res[k]?.data?.[0]; out[c] = d?.ticker ? d.ticker.replace(/\//g, '.').replace(/[^A-Z0-9.]/gi, '') : null; });
    if (i + 10 < cusips.length) await new Promise((r) => setTimeout(r, gapMs));
  }
  // foreign-incorporated companies listed in the US (Chubb, Medtronic…) have non-US CUSIPs: ask again without the exchange
  const miss = cusips.filter((c) => !out[c]);
  for (let i = 0; i < miss.length; i += 10) {
    await new Promise((r) => setTimeout(r, gapMs));
    const batch = miss.slice(i, i + 10);
    const res = await getJSON<{ data?: { ticker: string; exchCode?: string; marketSector?: string }[] }[]>('https://api.openfigi.com/v3/mapping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 20000,
      body: JSON.stringify(batch.map((c) => ({ idType: 'ID_CUSIP', idValue: c }))),
    }).catch(() => []);
    batch.forEach((c, k) => { const d = res[k]?.data?.find((x) => x.marketSector === 'Equity' && x.exchCode === 'US') ?? res[k]?.data?.find((x) => x.marketSector === 'Equity'); if (d?.ticker) out[c] = d.ticker.replace(/\//g, '.').replace(/[^A-Z0-9.]/gi, ''); });
  }
  return out;
}

/** 13F issuer names are abbreviated ("JANUS HENDERSON GROUP PLC", "ALPHABET INC"): compare the first two significant words. */
const STOP = /\b(inc|corp|corporation|co|company|plc|ltd|limited|group|holdings?|hldgs?|class|cl|com|new|the|n\.?v|s\.?a|ag|se|lp|llc|ord|shs|sponsored|adr|ads|common|stock|ordinary|shares)\b/g;
export const nameKey = (n: string) => n.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(STOP, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
/** Ticker for an issuer name from a list of {symbol, name}, only when exactly one company matches. */
export function tickerByName(issuer: string, rows: { s: string; n: string }[]): string | null {
  const k = nameKey(issuer);
  if (!k || k.length < 4) return null;
  const hits = [...new Set(rows.filter((r) => nameKey(r.n) === k).map((r) => r.s))];
  return hits.length === 1 ? hits[0] : null;
}

/** Funds holding a ticker, biggest share of their portfolio first. Tickers compare without punctuation (BRK.B = BRK/B). */
export const symKey = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
export function holdersOf(d: FundsData | undefined, t: string) {
  const k = symKey(t);
  return (d?.funds ?? []).flatMap((f) => f.holdings.filter((h) => h.t && symKey(h.t) === k).map((h) => ({ fund: f, h }))).sort((a, b) => b.h.pct - a.h.pct);
}

export const FUNDS_SRC: SourceDef<FundsData> = {
  id: 'sec:funds', label: 'Fund holdings (13F)', provider: 'SEC EDGAR · OpenFIGI', every: 6 * 60 * 60_000,
  asOf: snapTime('funds.json'),
  fetch: () => snap<FundsData>('funds.json'),
};
