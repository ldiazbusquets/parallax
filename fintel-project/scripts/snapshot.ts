/* Builds the data snapshot for the website (run by .github/workflows/deploy.yml every ~15 minutes).
   Fetches the sources browsers can't reach directly (Yahoo, FRED, SEC, RSS) and writes public/snap/*.json
   as { generated, data }. Company files (SEC financials + Form 4) are refreshed when older than 20 hours.
   Usage: npx vite-node scripts/snapshot.ts [--only=quotes,fred,sec,rss,ecocal,yields,screener,companies,funds,…]                          */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chartQuotes, chartLive, ohlcSnapName, sparkLive, SNAP_FILES } from '../src/data/yahoo';
import { ecoCalendar, govYields } from '../src/data/global';
import { dashSym, finnhubRecs, finraShortInterest, nasdaqScreenerFresh, topCompanies, TRACKED, WIDE_N, type ScreenRow } from '../src/data/equity';
import { fetchCargo, fetchPorts } from '../src/data/trade';
import { figiTickers, FUNDS, FUNDS_V, tickerByName, latest13F, shapeHoldings, type Fund, type FundsData } from '../src/data/funds';
import { unzipSync, strFromU8 } from 'fflate';
import { parseGdeltExport, summariseWindow, type Ev } from '../src/data/events';
import { fredMany, DAILY_IDS, MACRO_IDS, FRED_SINCE } from '../src/data/fred';
import { EDGAR_FORMS, edgarUrl, edgarSnapName, FEEDS, finnhubEarnings, finnhubIpos, finnhubSeason, groqBrief, GROQ_MODEL, bisPolicy, imfWeo, finnhubCompanyNews } from '../src/data/sources';
import { briefPrompt } from '../src/data/brief';
import { buildCompany, buildNetwork, coSnapName, type CompanyData } from '../src/data/company';
import { COMMODITIES, COUNTRIES, DEFAULT_WATCHLIST, FX, HEATMAP, INDICES, SECTORS, TAPE, VOL, WORLD_FX } from '../src/data/universe';
import { getText } from '../src/lib/http';

const OUT = path.resolve(__dirname, '../public/snap');
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (k: string) => !only.length || only.includes(k);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const report: Record<string, string> = {};

async function save(name: string, data: unknown, generated = Date.now()) {
  const file = path.join(OUT, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ generated, data }));
}
const DAY_MS = Number(process.env.COMPANIES_MAX_AGE_H ?? 20) * 3600_000;
/** True if a snapshot file exists and is younger than the daily refresh age. */
async function readSnap<T>(f: string): Promise<{ generated: number; data: T } | undefined> {
  try { return JSON.parse(await readFile(path.join(OUT, f), 'utf8')) as { generated: number; data: T }; } catch { return undefined; }
}
const read = async <T>(f: string): Promise<T | undefined> => (await readSnap<T>(f))?.data;
async function fresh(name: string) {
  try { return Date.now() - (JSON.parse(await readFile(path.join(OUT, name), 'utf8')) as { generated: number }).generated < DAY_MS; } catch { return false; }
}
/** Run one step with a hard time limit, so a hanging source can never stall the whole deploy. */
async function step(name: string, fn: () => Promise<string>, limitMs = 4 * 60_000) {
  const t0 = Date.now();
  try {
    const msg = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`gave up after ${limitMs / 1000}s`)), limitMs))]);
    report[name] = 'ok · ' + msg; log('✓', name, msg, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) { report[name] = 'failed · ' + (e as Error).message; log('✗', name, (e as Error).message, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`); }
}

/** Quick reachability check of each host, printed first so a broken source is obvious in the log. */
async function probe() {
  const targets: [string, string][] = [
    ['yahoo SPY', 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=5m'],
    ['yahoo ES=F', 'https://query2.finance.yahoo.com/v8/finance/chart/ES%3DF?range=1d&interval=5m'],
    ['yahoo ^VIX', 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=5m'],
    ['fred csv', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-01-01'],
    ['sec', 'https://www.sec.gov/files/company_tickers.json'],
  ];
  for (const [label, url] of targets) {
    const t0 = Date.now();
    try { const body = await getText(url, { timeout: 15000 }); log('probe', label, 'ok', `${body.length}B`, `${Date.now() - t0}ms`); }
    catch (e) { log('probe', label, 'ERROR', (e as Error).message, `${Date.now() - t0}ms`); }
  }
}

export const SYMBOLS = [...new Set([
  ...TAPE.map((x) => x[0]), ...INDICES.flatMap((r) => r.items.map((x) => x[0])), ...SECTORS.map((x) => x[0]), 'SPY',
  ...VOL.map((x) => x[0]), ...COMMODITIES.flatMap((g) => g.items.map((x) => x[0])), ...FX.map((x) => x[0]),
  ...HEATMAP.flatMap((g) => g.items), ...COUNTRIES.flatMap((c) => [c.index?.[0], c.fx?.[0]]).filter((x): x is string => !!x),
  ...DEFAULT_WATCHLIST, 'ZQ=F',
])];
export const COMPANIES = [...new Set([...HEATMAP.flatMap((g) => g.items), ...DEFAULT_WATCHLIST])].filter((t) => !['SPY', 'QQQ', 'TLT'].includes(t));

/** The largest US companies (from the screener snapshot) that the site builds full pages for, beyond TRACKED. */
async function wideList(): Promise<string[]> {
  const rows = await read<ScreenRow[]>('screener.json');
  const have = new Set(COMPANIES.map((t) => t.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  return topCompanies(rows ?? [], WIDE_N).map((r) => r.s).filter((s) => !have.has(s.toUpperCase().replace(/[^A-Z0-9]/g, '')));
}
/** Missing files first, then the oldest; `maxAge` ms decides what is due. */
async function due(names: { key: string; file: string }[], maxAge: number) {
  const ages = await Promise.all(names.map(async (n) => ({ ...n, gen: (await readSnap<unknown>(n.file))?.generated ?? 0 })));
  return { todo: ages.filter((a) => Date.now() - a.gen >= maxAge).sort((a, b) => a.gen - b.gen), fresh: ages.filter((a) => Date.now() - a.gen < maxAge).length };
}
const CACHE = path.resolve(__dirname, '../.cache');
async function readCache<T>(f: string, dflt: T): Promise<T> { try { return JSON.parse(await readFile(path.join(CACHE, f), 'utf8')) as T; } catch { return dflt; } }
async function writeCache(f: string, x: unknown) { await mkdir(CACHE, { recursive: true }); await writeFile(path.join(CACHE, f), JSON.stringify(x)); }

async function main() {
  await mkdir(OUT, { recursive: true });
  await probe();

  if (want('quotes')) {
    await step('quotes', async () => {
      const d1 = await chartQuotes(SYMBOLS, '1d', '5m');
      if (Object.keys(d1).length < SYMBOLS.length * 0.5) throw new Error(`only ${Object.keys(d1).length}/${SYMBOLS.length} symbols returned`);
      // currencies of every other country on the map (spark: 20 per request, so a few seconds)
      const extra = WORLD_FX.filter((x) => !d1[x]);
      let fx = 0;
      try { const q = await sparkLive(extra, '1d', '5m'); for (const [k, v] of Object.entries(q)) if (!d1[k]) { d1[k] = v; fx++; } } catch (e) { log('  world fx', (e as Error).message); }
      await save(SNAP_FILES['1d'], d1);
      return `${Object.keys(d1).length - fx}/${SYMBOLS.length} symbols + ${fx}/${extra.length} other currencies`;
    });
    // Longer histories change slowly: rebuild them once a day (the workflow caches them between runs).
    for (const [file, range, interval] of [[SNAP_FILES['1y'], '1y', '1d'], [SNAP_FILES['5y'], '5y', '1wk']] as const) {
      await step('history ' + range, async () => {
        if (await fresh(file)) {
          // cached today: only fetch symbols added since (e.g. new countries), and merge them in
          const old = await readSnap<Record<string, unknown>>(file), have = old?.data;
          const missing = SYMBOLS.filter((x) => !have?.[x]);
          if (!old || !have || !missing.length) return 'cached';
          const add = await chartQuotes(missing, range, interval);
          await save(file, { ...have, ...add }, old.generated); // keep the original date so the daily rebuild still happens
          return `cached + ${Object.keys(add).length}/${missing.length} new symbols`;
        }
        const q = await chartQuotes(SYMBOLS, range, interval);
        if (Object.keys(q).length < SYMBOLS.length * 0.5) throw new Error(`only ${Object.keys(q).length} symbols`);
        await save(file, q);
        return `${Object.keys(q).length} symbols`;
      });
    }
    // Daily OHLC bars for candlesticks: tracked companies, indices and sector ETFs (rebuilt once a day).
    await step('ohlc', async () => {
      const syms = [...new Set([...TRACKED, ...DEFAULT_WATCHLIST, ...TAPE.map((x) => x[0]), ...INDICES.flatMap((r) => r.items.map((x) => x[0])), ...SECTORS.map((x) => x[0]), 'SPY', 'QQQ'])];
      const wide = await wideList(), t0 = Date.now();
      let done = 0, kept = 0, failed = 0, left = 0;
      for (const s of [...syms, ...wide]) {
        const f = ohlcSnapName(s);
        if (await fresh(f)) { kept++; continue; }
        if (Date.now() - t0 > 4.5 * 60_000) { left++; continue; } // the rest next run
        try {
          const b = await chartLive(dashSym(s), '1y', '1d');
          if (!b.o) throw new Error('no OHLC');
          await save(f, b); done++;
        } catch (e) { failed++; if (failed <= 3) log('  ohlc', s, (e as Error).message); }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!done && !kept) throw new Error(`all ${failed} failed`);
      return `${done} refreshed, ${kept} cached, ${failed} failed${left ? `, ${left} next run` : ''} (incl. ${wide.length} largest companies)`;
    }, 5.5 * 60_000);
    await step('gspc-history', async () => {
      if (await fresh('chart-_GSPC-max.json')) return 'cached';
      const b = await chartLive('^GSPC', 'max', '1mo'); await save('chart-_GSPC-max.json', b); return `${b.c.length} months`;
    });
  }

  if (want('fred')) {
    await step('fred', async () => {
      // Without an API key, FRED's public CSV tends to time out from cloud runners: check once, then skip fast.
      if (!process.env.FRED_API_KEY) await getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-01-01', { timeout: 15000 }).catch(() => { throw new Error('FRED unreachable without FRED_API_KEY secret'); });
      const [daily, macro] = await Promise.all([fredMany(DAILY_IDS, FRED_SINCE.daily), fredMany(MACRO_IDS, FRED_SINCE.macro)]);
      const n = Object.keys(daily).length + Object.keys(macro).length;
      if (n < (DAILY_IDS.length + MACRO_IDS.length) * 0.6) throw new Error(`only ${n} series`);
      await save('fred.json', { daily, macro });
      return `${n} series`;
    });
  }

  if (want('sec')) {
    for (const form of EDGAR_FORMS) {
      await step('sec ' + form, async () => { const x = await getText(edgarUrl(form)); if (!x.includes('<entry')) throw new Error('no entries'); await save(edgarSnapName(form), x); return `${(x.match(/<entry>/g) || []).length} filings`; });
    }
  }

  if (want('rss')) {
    await step('rss', async () => {
      const out: Record<string, string> = {};
      for (const f of FEEDS) { try { out[f.key] = await getText(f.url); } catch (e) { log('  feed', f.key, (e as Error).message); } }
      if (!Object.keys(out).length) throw new Error('no feeds');
      await save('rss.json', out);
      return Object.keys(out).join(', ');
    });
  }

  if (want('imf')) {
    await step('imf', async () => {
      try { const d = await imfWeo(); await save('imf.json', d); return `${Object.keys(d.data).length} economies · ${d.edition}`; } catch (e) {
        // imf.org refuses GitHub's servers. Publish the copy saved from imf.org (scripts/imf-weo-saved.json, same
        // API, checksum-verified); refresh it when the IMF releases a new edition (April and October).
        const saved = JSON.parse(await readFile(new URL('./imf-weo-saved.json', import.meta.url), 'utf8')) as import('../src/data/sources').ImfData;
        await save('imf.json', saved);
        return `live fetch failed (${(e as Error).message}); published the saved ${saved.edition} copy from ${saved.saved}`;
      }
    });
  }

  if (want('events')) {
    await step('events', async () => {
      // Rolling 7-day window of GDELT event files (one every 15 min), kept in .cache between runs; the site shows
      // the last 24 h by default, the 7 days on request, and each country's last 24 h against its daily average.
      const cacheFile = path.join(path.dirname(OUT), '..', '.cache', 'events-raw-v5.json');
      let cache: { done: string[]; evs: Ev[] } = { done: [], evs: [] };
      try { cache = JSON.parse(await readFile(cacheFile, 'utf8')); } catch { /* first run */ }
      const now = Date.now(), cutoff = now - 7 * 864e5, q = 15 * 60_000, t0 = Date.now();
      const todo = [] as string[];
      for (let t = Math.floor(now / q) * q - 2 * q; t > cutoff; t -= q) { // newest first; the latest file can lag a few minutes
        const id = new Date(t).toISOString().replace(/[-:T]/g, '').slice(0, 12) + '00';
        if (!cache.done.includes(id)) todo.push(id);
      }
      let added = 0, files = 0;
      for (const id of todo.slice(0, 300)) { // newest first; the week fills over a few runs (each file is small)
        if (Date.now() - t0 > 4 * 60_000) break;
        try {
          const res = await fetch(`http://data.gdeltproject.org/gdeltv2/${id}.export.CSV.zip`);
          if (res.status === 404) continue;
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const z = unzipSync(new Uint8Array(await res.arrayBuffer()));
          const tsv = strFromU8(Object.values(z)[0]);
          const evs = parseGdeltExport(tsv);
          cache.evs.push(...evs); cache.done.push(id); added += evs.length; files++;
        } catch (e) { log('  gdelt', id, (e as Error).message); }
      }
      cache.evs = cache.evs.filter((e) => e[0] > cutoff);
      cache.done = cache.done.filter((id) => Date.UTC(+id.slice(0, 4), +id.slice(4, 6) - 1, +id.slice(6, 8), +id.slice(8, 10), +id.slice(10, 12)) > cutoff);
      if (!cache.evs.length) throw new Error('no GDELT events fetched');
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, JSON.stringify(cache));
      const sum = summariseWindow(cache.evs, now);
      await save('events.json', sum);
      return `${files} new files (+${added}) · ${sum.total} events in 24 h, ${sum.week?.total} in the window · ${cache.done.length}/672 files`;
    }, 6 * 60_000);
  }

  if (want('ecocal')) {
    await step('ecocal', async () => {
      // the feed asks for gentle polling: hourly is plenty for a weekly calendar
      const old = await readSnap<unknown>('ecocal.json');
      if (old && Date.now() - old.generated < 55 * 60_000) return 'cached (hourly)';
      const e = await ecoCalendar(); await save('ecocal.json', e); return `${e.length} events this week`;
    });
  }

  if (want('yields')) {
    await step('yields', async () => {
      const y = await govYields();
      const good = Object.entries(y).filter(([, v]) => v?.series);
      for (const [k, v] of Object.entries(y)) if (v?.error) log('  yields', k, v.error);
      if (!good.length) throw new Error('no issuer responded');
      await save('yields.json', y);
      return good.map(([k, v]) => `${k} ${v!.series!.at(-1)!.v}% (${v!.series!.at(-1)!.d})`).join(', ');
    });
  }

  if (want('screener')) {
    await step('screener', async () => {
      const r = await nasdaqScreenerFresh(); await save('screener.json', r);
      const nv = r.find((x) => x.s === 'NVDA');
      return `${r.length} stocks, ${r.filter((x) => x.t).length} with Yahoo prices (e.g. NVDA ${nv?.p} ${nv?.ch?.toFixed(2)}%)`;
    });
    await step('shorts', async () => {
      const old = await readSnap<unknown>('shorts.json');
      if (old && Date.now() - old.generated < 12 * 3600_000) return 'cached (12h)';
      const list = [...TRACKED, ...await wideList()], s: Awaited<ReturnType<typeof finraShortInterest>> = {};
      for (let i = 0; i < list.length; i += 150) { // FINRA writes share classes with a dot (BRK.B)
        const part = list.slice(i, i + 150), finra = new Map(part.map((t) => [t.replace(/[/-]/g, '.'), t]));
        try { for (const [k, v] of Object.entries(await finraShortInterest([...finra.keys()]))) s[finra.get(k) ?? k] = v; } catch (e) { log('  shorts', i, (e as Error).message); }
      }
      if (!Object.keys(s).length) throw new Error('FINRA returned no short interest');
      await save('shorts.json', s);
      const any = Object.entries(s)[0];
      return `${Object.keys(s).length}/${list.length} companies · e.g. ${any?.[0]} ${any?.[1].short} short, ${any?.[1].dtc?.toFixed(1)} days (${any?.[1].date})`;
    });
  }

  if (want('cargo')) {
    await step('cargo', async () => {
      const c = await fetchCargo(3000); // adsb.lol rate-limits bursts: one hub every 3 s
      await save('cargo.json', c, c.at);
      const busiest = Object.entries(c.hubs).sort((a, b) => (b[1].air + b[1].ground) - (a[1].air + a[1].ground))[0];
      return `${c.planes.length} cargo aircraft near ${Object.values(c.hubs).filter((h) => h.ok).length}/${Object.keys(c.hubs).length} hubs · busiest ${busiest?.[0]} (${busiest ? busiest[1].air + busiest[1].ground : 0})`;
    }, 2 * 60_000);
  }

  if (want('ports')) {
    await step('ports', async () => {
      // PortWatch updates weekly and its daily port table is slow to query (20–30 s a page): once a day is plenty
      const old = await readSnap<unknown>('ports.json');
      if (old && Date.now() - old.generated < 20 * 3600_000) return 'cached (daily)';
      const d = await fetchPorts(); await save('ports.json', d);
      return `${d.ports.length} ports, ${Object.values(d.daily).reduce((a, x) => a + x.length, 0)} daily rows to ${d.last}`;
    }, 5 * 60_000);
  }

  if (want('bis')) {
    await step('bis', async () => { const p = await bisPolicy(); await save('bis.json', p); return `${Object.keys(p).length} central banks`; });
  }

  if (want('finnhub') && process.env.FINNHUB_API_KEY) {
    const k = process.env.FINNHUB_API_KEY;
    await step('earnings', async () => { const e = await finnhubEarnings(k); await save('earnings.json', e); return `${e.upcoming.length} upcoming, ${e.reported.length} reported`; });
    await step('company news', async () => {
      const old = await readSnap<Record<string, unknown>>('conews.json');
      if (old && Date.now() - old.generated < 2 * 3600_000) return 'cached (2h)';
      const out: Record<string, unknown> = {};
      for (const t of COMPANIES) { // Finnhub free tier: 60 calls/min
        try { out[t] = await finnhubCompanyNews(t, k); } catch (e) { log('  news', t, (e as Error).message); }
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (!Object.keys(out).length) throw new Error('no company news');
      await save('conews.json', out);
      return `${Object.keys(out).length} companies`;
    }, 3 * 60_000);
    await step('ratings', async () => {
      // tracked companies daily, the largest-500 list about weekly; ~150 calls a run (free tier: 60 calls/min)
      const out = (await read<Record<string, unknown>>('ratings.json')) ?? {};
      const at = await readCache<Record<string, number>>('ratings-at.json', {});
      const wide = await wideList(), t0 = Date.now();
      const isDue = (t: string, age: number) => Date.now() - (at[t] ?? 0) > age;
      const todo = [...TRACKED.filter((t) => isDue(t, 20 * 3600_000)), ...wide.filter((t) => isDue(t, 6 * 864e5)).sort((a, b) => (at[a] ?? 0) - (at[b] ?? 0))];
      let n = 0;
      for (const t of todo) {
        if (Date.now() - t0 > 2.5 * 60_000) break;
        try { const r = await finnhubRecs(t.replace(/[/-]/g, '.'), k); if (r.length) out[t] = r; at[t] = Date.now(); n++; } catch (e) { log('  ratings', t, (e as Error).message); }
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (!Object.keys(out).length) throw new Error('no ratings');
      await writeCache('ratings-at.json', at);
      if (n) await save('ratings.json', out);
      return `${n} refreshed, ${Object.keys(out).length} companies, ${Math.max(0, todo.length - n)} due later`;
    }, 3 * 60_000);
    await step('season', async () => {
      const old = await readSnap<unknown>('season.json');
      if (old && Date.now() - old.generated < 6 * 3600_000) return 'cached (6h)';
      const large = new Set(topCompanies((await read<ScreenRow[]>('screener.json')) ?? [], WIDE_N).map((r) => r.s.toUpperCase().replace(/[^A-Z0-9]/g, '')));
      if (large.size < 100) throw new Error('no screener to pick the largest companies from');
      const d = await finnhubSeason(k, large);
      await save('season.json', d);
      return `${d.all.n} reports, ${d.all.beatPct?.toFixed(0)}% beat · largest ${d.largeN}: ${d.large.n} reported, ${d.large.beatPct?.toFixed(0)}% beat`;
    });
    await step('ipos', async () => { const i = await finnhubIpos(k); await save('ipo.json', i); return `${i.length} IPOs`; });
  }

  if (want('brief') && process.env.GROQ_API_KEY) {
    await step('brief', async () => {
      try { const old = JSON.parse(await readFile(path.join(OUT, 'brief.json'), 'utf8')) as { generated: number }; if (Date.now() - old.generated < 55 * 60_000) return 'cached (hourly)'; } catch { /* first one */ }
      const q = await read<Record<string, import('../src/data/yahoo').Quote>>(SNAP_FILES['1d']);
      if (!q) throw new Error('no quotes to write from');
      const fred = await read<Record<'daily' | 'macro', Record<string, import('../src/data/fred').Series>>>('fred.json');
      const text = await groqBrief(briefPrompt(q, fred?.daily ?? {}, fred?.macro ?? {}), process.env.GROQ_API_KEY);
      await save('brief.json', { text, at: Date.now(), model: GROQ_MODEL });
      return `${text.split(/\s+/).length} words`;
    });
  }

  if (want('companies')) {
    await step('companies', async () => {
      let done = 0, kept = 0, failed = 0;
      for (const t of COMPANIES) {
        const file = path.join(OUT, coSnapName(t));
        try {
          const old = JSON.parse(await readFile(file, 'utf8')) as { generated: number };
          if (Date.now() - old.generated < DAY_MS) { kept++; continue; }
        } catch { /* not cached yet */ }
        try { await save(coSnapName(t), await buildCompany(t)); done++; }
        catch (e) { failed++; log('  company', t, (e as Error).message); }
      }
      if (!done && !kept) throw new Error(`all ${failed} failed`);
      return `${done} refreshed, ${kept} cached, ${failed} failed`;
    }, 10 * 60_000);
    await step('companies-wide', async () => {
      // the 500 largest US companies: refreshed weekly, a slice per run (missing ones first), lighter on Form 4s
      const wide = await wideList(), t0 = Date.now();
      const { todo, fresh: kept } = await due(wide.map((t) => ({ key: t, file: coSnapName(t) })), 7 * 864e5);
      let done = 0, failed = 0;
      for (const x of todo) {
        if (Date.now() - t0 > 7 * 60_000) break;
        try { await save(x.file, await buildCompany(x.key, 8, 6)); done++; }
        catch (e) { failed++; if (failed <= 5) log('  company', x.key, (e as Error).message); }
      }
      if (!wide.length) throw new Error('no screener snapshot to pick companies from');
      return `${done} built, ${kept} current, ${failed} failed, ${todo.length - done - failed} next run (of ${wide.length})`;
    }, 8 * 60_000);
  }

  if (want('funds')) {
    await step('funds', async () => {
      // 13F filings change once a quarter: check daily for a newer one; CUSIP → ticker map is kept in .cache
      const old = await readSnap<FundsData>('funds.json');
      if (old && old.data.v === FUNDS_V && Date.now() - old.generated < 20 * 3600_000) return 'cached (daily)';
      const cus = await readCache<Record<string, string | null>>('cusips-v2.json', {});
      const raw: { def: (typeof FUNDS)[number]; r: Awaited<ReturnType<typeof latest13F>> }[] = [], errors: string[] = [];
      for (const def of FUNDS) { try { raw.push({ def, r: await latest13F(def) }); } catch (e) { errors.push(`${def.name}: ${(e as Error).message}`); log('  13F', def.name, (e as Error).message); } }
      const need = [...new Set(raw.flatMap((x) => x.r.rows.slice(0, 40).map((h) => h.cusip)))].filter((c) => !(c in cus));
      if (need.length) { try { Object.assign(cus, await figiTickers(need.slice(0, 600))); } catch (e) { log('  openfigi', (e as Error).message); } await writeCache('cusips-v2.json', cus); }
      // whatever OpenFIGI couldn't map: match the issuer name against the screener (only an unambiguous match counts)
      const screen = (await read<ScreenRow[]>('screener.json')) ?? [];
      const names = new Map(raw.flatMap((x) => x.r.rows.map((h) => [h.cusip, h.issuer] as const)));
      let byName = 0;
      for (const [c, n] of names) if (!cus[c]) { const t = tickerByName(n, screen); if (t) { cus[c] = t; byName++; } }
      const funds: Fund[] = raw.map(({ def, r }) => ({ cik: def.cik, name: def.name, style: def.style, period: r.period, filed: r.filed, positions: r.rows.length, link: r.link, ...shapeHoldings(r.rows, cus) }));
      if (!funds.length) throw new Error(errors.join('; '));
      await save('funds.json', { funds, errors, v: FUNDS_V } satisfies FundsData);
      return `${funds.length}/${FUNDS.length} funds, ${need.length} new CUSIPs looked up, ${byName} matched by name · ${funds.map((f) => f.name.split(' ')[0] + ' ' + f.period).slice(0, 4).join(', ')}…`;
    }, 6 * 60_000);
  }

  // the network is rebuilt from whatever company files exist
  await step('network', async () => {
    const dir = path.join(OUT, 'co');
    const files = await readdir(dir).catch(() => [] as string[]);
    const cos: CompanyData[] = [];
    for (const f of files) cos.push((JSON.parse(await readFile(path.join(dir, f), 'utf8')) as { data: CompanyData }).data);
    if (!cos.length) throw new Error('no company files');
    const net = buildNetwork(cos, await read<FundsData>('funds.json'));
    await save('network.json', net);
    await save('companies.json', cos.map((c) => ({ ticker: c.ticker, name: c.name, industry: c.industry })));
    return `${net.companies.length} companies, ${net.people.length} people, ${net.people.filter((p) => p.links.length > 1).length} connecting 2+ companies, ${net.holders?.length ?? 0} funds/activists`;
  });

  await save('meta.json', report);
  const failed = Object.values(report).filter((v) => v.startsWith('failed')).length;
  log(`done · ${failed} step(s) failed`);
  // Only fail the job if nothing usable was produced, so one flaky source never blocks the deploy.
  // Exit explicitly: a step that hit its time limit may still have requests in flight.
  process.exit(failed && failed === Object.keys(report).length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
