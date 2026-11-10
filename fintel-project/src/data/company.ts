import { getJSON, getText, pool } from '@/lib/http';
import { HOST, NODE, snap, snapTime, STATIC } from '@/lib/env';
import { sourceFor, type SourceDef } from './store';
import type { FundsData } from './funds';

// Company profiles from SEC EDGAR: submissions (profile + filings), XBRL company facts (financials) and
// Form 4 filings (insider transactions). All primary-source, no keys.

// ------------------------------------------------------------------ types
export interface Fact { start?: string; end: string; val: number; fy?: number; fp?: string; form: string; filed: string; frame?: string }
interface FactsDoc { cik: number; entityName: string; facts: Record<string, Record<string, { units: Record<string, Fact[]> }>> }

export interface Period { end: string; start?: string; val: number; form: string; filed: string }
export interface Metric { annual: Period[]; quarters: Period[]; ttm: Period | null; latest: Period | null }
export interface InsiderTx {
  date: string; owner: string; ownerCik: string; role: string; code: string; codeLabel: string;
  shares: number | null; price: number | null; acquired: boolean | null; after: number | null; link: string;
}
export interface FilingRef { form: string; date: string; desc: string; items: string; link: string }
export interface Person { cik: string; name: string; role: string; isDirector: boolean; isOfficer: boolean; tenPct: boolean }
/** A 5%+ holder's Schedule 13D (activist / control intent) or 13G (passive) filing about this company. */
export interface Stake { filer: string; form: '13D' | '13G'; amended: boolean; filed: string; event: string; pct: number | null; shares: number | null; link: string }
export interface CompanyData {
  ticker: string; cik: string; name: string; sic: string; industry: string; exchange: string; fiscalYearEnd: string;
  state: string; website: string; description: string;
  metrics: Record<string, Metric>;
  shares: { val: number; end: string } | null;
  insiders: InsiderTx[];
  people: Person[];
  filings: FilingRef[];
  stakes?: Stake[];
  generated: number;
}

// ------------------------------------------------------------------ CIK lookup
let tickerMap: Promise<Record<string, { cik: string; title: string }>> | null = null;
export function lookupTicker(t: string) {
  tickerMap ??= getJSON<Record<string, { cik_str: number; ticker: string; title: string }>>(`${HOST.sec}/files/company_tickers.json`).then((j) => {
    const m: Record<string, { cik: string; title: string }> = {};
    for (const r of Object.values(j)) m[r.ticker.toUpperCase()] = { cik: String(r.cik_str).padStart(10, '0'), title: r.title };
    return m;
  }).catch((e) => { tickerMap = null; throw e; });
  return tickerMap.then((m) => m[t.toUpperCase()] ?? m[t.toUpperCase().replace(/[/.]/, '-')] ?? m[t.toUpperCase().replace(/[/-]/, '.')]);
}

// ------------------------------------------------------------------ financials
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

/** Which XBRL concepts to try, in order (companies switch concepts over time). */
export const CONCEPTS: Record<string, { label: string; names: string[]; unit?: string; kind: 'flow' | 'instant'; ns?: string }> = {
  revenue: { label: 'Revenue', kind: 'flow', names: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'] },
  grossProfit: { label: 'Gross profit', kind: 'flow', names: ['GrossProfit'] },
  rnd: { label: 'R&D', kind: 'flow', names: ['ResearchAndDevelopmentExpense'] },
  operatingIncome: { label: 'Operating income', kind: 'flow', names: ['OperatingIncomeLoss'] },
  netIncome: { label: 'Net income', kind: 'flow', names: ['NetIncomeLoss', 'ProfitLoss'] },
  eps: { label: 'EPS (diluted)', kind: 'flow', names: ['EarningsPerShareDiluted'], unit: 'USD/shares' },
  ocf: { label: 'Operating cash flow', kind: 'flow', names: ['NetCashProvidedByUsedInOperatingActivities'] },
  capex: { label: 'Capital expenditure', kind: 'flow', names: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'] },
  cash: { label: 'Cash & equivalents', kind: 'instant', names: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'] },
  assets: { label: 'Total assets', kind: 'instant', names: ['Assets'] },
  liabilities: { label: 'Total liabilities', kind: 'instant', names: ['Liabilities'] },
  equity: { label: 'Shareholders’ equity', kind: 'instant', names: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'] },
  debt: { label: 'Long-term debt', kind: 'instant', names: ['LongTermDebtNoncurrent', 'LongTermDebt'] },
};

/** Merge facts across concept names: the first concept that reports a period wins; within it, the latest filing. */
export function mergeFacts(doc: FactsDoc, names: string[], unit = 'USD', ns = 'us-gaap'): Fact[] {
  const best = new Map<string, { f: Fact; rank: number }>();
  names.forEach((n, rank) => {
    for (const f of doc.facts[ns]?.[n]?.units?.[unit] ?? []) {
      if (!/^10-[KQ]/.test(f.form)) continue;
      const k = (f.start ?? '') + '|' + f.end;
      const prev = best.get(k);
      if (!prev || rank < prev.rank || (rank === prev.rank && f.filed > prev.f.filed)) best.set(k, { f, rank });
    }
  });
  return [...best.values()].map((x) => x.f).sort((a, b) => a.end.localeCompare(b.end));
}

const P = (f: Fact): Period => ({ end: f.end, start: f.start, val: f.val, form: f.form, filed: f.filed });

/** Annual = ~1-year durations from 10-Ks; quarters = ~3-month durations; TTM = last FY + current YTD − prior YTD. */
export function flowMetric(facts: Fact[]): Metric {
  const annual = facts.filter((f) => f.start && days(f.start, f.end) > 330 && days(f.start, f.end) < 380 && f.form.startsWith('10-K')).map(P).slice(-5);
  const quarters = facts.filter((f) => f.start && days(f.start, f.end) > 80 && days(f.start, f.end) < 100).map(P).slice(-6);
  const fy = annual[annual.length - 1];
  let ttm: Period | null = fy ?? null;
  if (fy) {
    // year-to-date periods that start right after the last fiscal year ended
    const ytd = facts.filter((f) => f.start && f.end > fy.end && Math.abs(days(fy.end, f.start)) <= 10 && days(f.start, f.end) < 330).sort((a, b) => a.end.localeCompare(b.end)).pop();
    if (ytd) {
      const prior = facts.find((f) => f.start && Math.abs(days(f.start, ytd.start!) - 365) <= 10 && Math.abs(days(f.end, ytd.end) - 365) <= 10 && Math.abs(days(f.start, f.end) - days(ytd.start!, ytd.end)) <= 10);
      if (prior) ttm = { end: ytd.end, start: undefined, val: fy.val + ytd.val - prior.val, form: 'TTM', filed: ytd.filed };
    }
  }
  const latest = [...quarters, ...annual].sort((a, b) => a.end.localeCompare(b.end)).pop() ?? null;
  return { annual, quarters, ttm, latest };
}
export function instantMetric(facts: Fact[]): Metric {
  const inst = facts.filter((f) => !f.start);
  const annual = inst.filter((f) => f.form.startsWith('10-K')).map(P);
  const byEnd = new Map(annual.map((p) => [p.end, p]));
  const latest = inst.length ? P(inst[inst.length - 1]) : null;
  return { annual: [...byEnd.values()].slice(-5), quarters: inst.slice(-6).map(P), ttm: latest, latest };
}

export function financials(doc: FactsDoc): { metrics: Record<string, Metric>; shares: CompanyData['shares'] } {
  const metrics: Record<string, Metric> = {};
  for (const [k, c] of Object.entries(CONCEPTS)) {
    const facts = mergeFacts(doc, c.names, c.unit ?? 'USD', c.ns ?? 'us-gaap');
    if (facts.length) metrics[k] = c.kind === 'flow' ? flowMetric(facts) : instantMetric(facts);
  }
  const sh = [...(doc.facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [])].sort((a, b) => a.end.localeCompare(b.end)).pop();
  return { metrics, shares: sh ? { val: sh.val, end: sh.end } : null };
}

// ------------------------------------------------------------------ Form 4
const CODES: Record<string, string> = { P: 'Buy', S: 'Sale', A: 'Award', M: 'Option exercise', F: 'Tax withholding', G: 'Gift', C: 'Conversion', D: 'Disposed to issuer', J: 'Other', X: 'Option exercise', W: 'Inheritance' };
const val = (x: string, tag: string) => {
  const m = x.match(new RegExp(`<${tag}>\\s*(?:<value>\\s*)?([^<]*)`, 'i'));
  return m ? m[1].trim() : '';
};
const blocks = (x: string, tag: string) => x.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gi')) ?? [];
const truthy = (s: string) => s === '1' || s.toLowerCase() === 'true';

export function parseForm4(xml: string, link: string): { tx: InsiderTx[]; people: Person[] } {
  const people: Person[] = blocks(xml, 'reportingOwner').map((o) => {
    const isDirector = truthy(val(o, 'isDirector')), isOfficer = truthy(val(o, 'isOfficer')), tenPct = truthy(val(o, 'isTenPercentOwner'));
    const title = val(o, 'officerTitle');
    const role = [isOfficer && title ? title : isOfficer ? 'Officer' : '', isDirector ? 'Director' : '', tenPct ? '10% owner' : ''].filter(Boolean).join(', ') || 'Other';
    return { cik: val(o, 'rptOwnerCik').padStart(10, '0'), name: tidyName(val(o, 'rptOwnerName')), role, isDirector, isOfficer, tenPct };
  });
  const lead = people[0];
  const tx: InsiderTx[] = blocks(xml, 'nonDerivativeTransaction').map((t) => {
    const code = val(t, 'transactionCode');
    const ad = val(t, 'transactionAcquiredDisposedCode');
    const n = (s: string) => (s === '' ? null : Number(s));
    return {
      date: val(t, 'transactionDate'), owner: lead?.name ?? '', ownerCik: lead?.cik ?? '', role: lead?.role ?? '',
      code, codeLabel: CODES[code] ?? code, shares: n(val(t, 'transactionShares')), price: n(val(t, 'transactionPricePerShare')),
      acquired: ad ? ad === 'A' : null, after: n(val(t, 'sharesOwnedFollowingTransaction')), link,
    };
  });
  return { tx, people };
}
/** "HUANG JEN HSUN" -> "Jen Hsun Huang" (SEC lists owners as LAST FIRST MIDDLE). Companies are left alone. */
export function tidyName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (/\b(INC|LLC|LP|L\.P\.|CORP|FUND|TRUST|PARTNERS|CAPITAL|HOLDINGS|MANAGEMENT|LTD|GROUP|PLC|N\.A\.)\b/i.test(s)) return s;
  const parts = s.split(' ');
  if (parts.length < 2) return s;
  const cap = (w: string) => w.length <= 2 && /^[A-Z]\.?$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase();
  return [...parts.slice(1), parts[0]].map((w) => w.split('-').map(cap).join('-')).join(' ');
}

// ------------------------------------------------------------------ Schedules 13D / 13G (XML since Dec 2024)
/** Tag lookups that ignore the namespace prefix (13G files use sch:, 13D files a default namespace). */
const xv = (x: string, tag: string) => x.match(new RegExp(`<(?:\\w+:)?${tag}>\\s*([^<]*)<`, 'i'))?.[1].trim() ?? '';
const xblocks = (x: string, tag: string) => x.match(new RegExp(`<(?:\\w+:)?${tag}>[\\s\\S]*?</(?:\\w+:)?${tag}>`, 'gi')) ?? [];
const usDate = (d: string) => { const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : d; };
/** Parse one 13D/13G primary_doc.xml. Returns null when it's about another issuer (the company may be the filer). */
export function parseStake(xml: string, issuerCik: string, filed: string, link: string): Stake | null {
  const type = xv(xml, 'submissionType').toUpperCase();
  const m = type.match(/13([DG])(\/A)?/);
  if (!m) return null;
  const issuer = xv(xml, 'issuerCik') || xv(xml, 'issuerCIK');
  if (!issuer || Number(issuer) !== Number(issuerCik)) return null;
  const persons = [...xblocks(xml, 'coverPageHeaderReportingPersonDetails'), ...xblocks(xml, 'reportingPersonInfo')];
  const first = persons[0] ?? xml;
  const filer = tidyFiler(xv(first, 'reportingPersonName'));
  if (!filer) return null;
  // a group files one statement: the largest percentage among its members is the group's stake
  let pct: number | null = null, shares: number | null = null;
  for (const p of persons.length ? persons : [xml]) {
    const pc = p.match(/<(?:\w+:)?(?:classPercent|percentOfClass|percentOfClassRepresented)>\s*([\d.]+)/i), sh = p.match(/<(?:\w+:)?(?:aggregateAmountOwned|reportingPersonBeneficiallyOwnedAggregateNumberOfShares)>\s*([\d.]+)/i);
    if (pc && (pct == null || +pc[1] > pct)) { pct = +pc[1]; shares = sh ? +sh[1] : shares; }
    else if (sh && shares == null) shares = +sh[1];
  }
  return { filer, form: m[1] === 'D' ? '13D' : '13G', amended: !!m[2], filed, event: usDate(xv(xml, 'eventDateRequiresFilingThisStatement') || xv(xml, 'dateOfEvent')), pct, shares, link };
}
/** Filer names: people come as "BUFFETT WARREN E" (flip them); organisations and already-formatted names stay as filed. */
const ORG = /\b(INC|LLC|L\.?L\.?C|LP|L\.P\.|CORP|CORPORATION|COMPANY|CO|FUND|TRUST|PARTNERS|CAPITAL|HOLDINGS?|MANAGEMENT|LTD|LIMITED|GROUP|PLC|N\.A\.|N\.V\.|S\.A\.|AG|SE|BANK|STICHTING|FOUNDATION|ASSOCIATES|ADVISORS|ADVISERS|INVESTMENTS?|SECURITIES|ENTERPRISES|VENTURES)\b/i;
export function tidyFiler(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s || s !== s.toUpperCase() || s.includes(',') || ORG.test(s)) return s;
  return tidyName(s);
}
/** Latest statement per filer, biggest stakes first; a filer whose latest says 0% (sold below 5%) drops out. */
export function latestStakes(list: Stake[]): Stake[] {
  const by = new Map<string, Stake>();
  for (const s of list) { const k = s.filer.toLowerCase(), p = by.get(k); if (!p || s.filed > p.filed) by.set(k, s); }
  return [...by.values()].filter((s) => s.pct !== 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
}

// ------------------------------------------------------------------ build a company
interface Submissions {
  cik: string; name: string; sic: string; sicDescription: string; tickers: string[]; exchanges: string[]; fiscalYearEnd: string;
  stateOfIncorporation: string; website: string; description: string;
  filings: { recent: { accessionNumber: string[]; filingDate: string[]; form: string[]; primaryDocument: string[]; primaryDocDescription: string[]; items: string[] } };
}
const archive = (cik: string, acc: string, doc: string) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, '')}/${doc}`;

export async function buildCompany(ticker: string, form4Limit = 20, stakeLimit = 10): Promise<CompanyData> {
  const hit = await lookupTicker(ticker);
  if (!hit) throw new Error(`${ticker} isn't an SEC-registered company (ETFs and foreign listings may not be)`);
  const [sub, facts] = await Promise.all([
    getJSON<Submissions>(`${HOST.secdata}/submissions/CIK${hit.cik}.json`),
    getJSON<FactsDoc>(`${HOST.secdata}/api/xbrl/companyfacts/CIK${hit.cik}.json`).catch(() => null),
  ]);
  const r = sub.filings.recent;
  const filings: FilingRef[] = [], f4: { url: string; link: string }[] = [], sch: { url: string; link: string; filed: string }[] = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i];
    if (/^SCHEDULE 13[DG](\/A)?$/.test(form)) {
      if (sch.length < stakeLimit) {
        const doc = r.primaryDocument[i], dir = r.accessionNumber[i].replace(/-/g, '');
        sch.push({ url: `${HOST.sec}/Archives/edgar/data/${Number(hit.cik)}/${dir}/${doc.replace(/^xsl[^/]+\//, '')}`, link: archive(hit.cik, r.accessionNumber[i], doc), filed: r.filingDate[i] });
      }
      continue;
    }
    if (form === '4') {
      if (f4.length < form4Limit) {
        const doc = r.primaryDocument[i];
        f4.push({ url: `${HOST.sec}/Archives/edgar/data/${Number(hit.cik)}/${r.accessionNumber[i].replace(/-/g, '')}/${doc.replace(/^xsl[^/]+\//, '')}`, link: archive(hit.cik, r.accessionNumber[i], doc) });
      }
    } else if (!/^(3|5|144|4\/A|3\/A|5\/A)$/.test(form) && filings.length < 30) {
      filings.push({ form, date: r.filingDate[i], desc: r.primaryDocDescription[i] || '', items: r.items[i] || '', link: archive(hit.cik, r.accessionNumber[i], r.primaryDocument[i]) });
    }
  }
  const parsed = await pool(f4, NODE ? 2 : 3, async (x) => parseForm4(await getText(x.url), x.link));
  const stakeRows: (Stake | null | undefined)[] = await pool(sch, NODE ? 2 : 3, async (x) => parseStake(await getText(x.url), hit.cik, x.filed, x.link)).catch(() => []);
  const stakes = latestStakes(stakeRows.filter((x): x is Stake => !!x));
  const insiders: InsiderTx[] = [], peopleMap = new Map<string, Person>();
  for (const p of parsed) {
    if (!p) continue;
    insiders.push(...p.tx);
    for (const person of p.people) if (!peopleMap.has(person.cik)) peopleMap.set(person.cik, person);
  }
  insiders.sort((a, b) => b.date.localeCompare(a.date));
  const fin = facts ? financials(facts) : { metrics: {}, shares: null };
  return {
    ticker: ticker.toUpperCase(), cik: hit.cik, name: sub.name, sic: sub.sic, industry: sub.sicDescription,
    exchange: sub.exchanges?.[0] ?? '', fiscalYearEnd: sub.fiscalYearEnd, state: sub.stateOfIncorporation,
    website: sub.website, description: sub.description, ...fin,
    insiders: insiders.slice(0, 60), people: [...peopleMap.values()], filings, stakes, generated: Date.now(),
  };
}

export const coSnapName = (t: string) => `co/${t.toUpperCase().replace(/[^A-Z0-9]/g, '_')}.json`;
export function companySource(ticker: string): SourceDef<CompanyData> {
  const id = 'company:' + ticker.toUpperCase();
  return sourceFor(id, () => ({
    id, label: `${ticker.toUpperCase()} filings & financials`, provider: 'SEC EDGAR', every: 6 * 60 * 60_000,
    asOf: STATIC ? snapTime(coSnapName(ticker)) : undefined,
    fetch: () => (STATIC ? snap<CompanyData>(coSnapName(ticker)) : buildCompany(ticker)),
  }));
}

// ------------------------------------------------------------------ network
export interface NetPerson { cik: string; name: string; links: { ticker: string; role: string }[] }
/** A fund (13F: `pct` = share of the fund's portfolio) or a 13D filer (`pct` = share of the company it owns). */
export interface NetHolder { id: string; name: string; kind: 'fund' | '13D'; style?: string; links: { ticker: string; pct: number | null }[] }
export interface Network { companies: { ticker: string; name: string; industry: string; people: number }[]; people: NetPerson[]; holders?: NetHolder[]; generated: number }
const symKey = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
export function buildHolders(cos: CompanyData[], funds?: FundsData): NetHolder[] {
  const byKey = new Map(cos.map((c) => [symKey(c.ticker), c.ticker]));
  const out: NetHolder[] = [];
  const cutoff = new Date(Date.now() - 270 * 864e5).toISOString().slice(0, 10); // a fund that stopped filing 13F isn't evidence of today's holdings
  for (const f of funds?.funds ?? []) {
    if (f.period < cutoff) continue;
    const links = f.holdings.filter((h) => h.t && byKey.has(symKey(h.t))).map((h) => ({ ticker: byKey.get(symKey(h.t!))!, pct: h.pct }));
    const uniq = [...new Map(links.map((l) => [l.ticker, l])).values()];
    if (uniq.length) out.push({ id: 'f:' + f.cik, name: f.name, kind: 'fund', style: f.style, links: uniq });
  }
  const d = new Map<string, NetHolder>();
  for (const c of cos) for (const st of c.stakes ?? []) {
    if (st.form !== '13D' || st.pct === 0) continue;
    const id = 'd:' + st.filer.toLowerCase().replace(/[^a-z0-9]/g, '');
    const h = d.get(id) ?? { id, name: st.filer, kind: '13D' as const, links: [] };
    if (!h.links.some((l) => l.ticker === c.ticker)) h.links.push({ ticker: c.ticker, pct: st.pct });
    d.set(id, h);
  }
  return [...out, ...d.values()];
}
export function buildNetwork(cos: CompanyData[], funds?: FundsData): Network {
  const people = new Map<string, NetPerson>();
  for (const c of cos) for (const p of c.people) {
    const e = people.get(p.cik) ?? { cik: p.cik, name: p.name, links: [] };
    if (!e.links.some((l) => l.ticker === c.ticker)) e.links.push({ ticker: c.ticker, role: p.role });
    people.set(p.cik, e);
  }
  return {
    companies: cos.map((c) => ({ ticker: c.ticker, name: c.name, industry: c.industry, people: c.people.length })),
    people: [...people.values()].sort((a, b) => b.links.length - a.links.length || a.name.localeCompare(b.name)),
    holders: buildHolders(cos, funds),
    generated: Date.now(),
  };
}
export const NETWORK: SourceDef<Network> = {
  id: 'network', label: 'Insider network', provider: 'SEC EDGAR (Form 4)', every: 6 * 60 * 60_000,
  asOf: snapTime('network.json'),
  fetch: () => snap<Network>('network.json'),
};
