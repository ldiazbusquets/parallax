// Where data comes from depends on how the app is running:
//  - dev / preview (npm run dev): CORS-blocked hosts go through the Vite relay at /px/<name>
//  - static website (VITE_STATIC=1): those hosts are read from snapshot files the GitHub job writes every ~15 min
//  - Node (the snapshot script): hosts are fetched directly
import { getText } from './http';

export const NODE = typeof window === 'undefined';
export const STATIC = !NODE && import.meta.env.VITE_STATIC === '1';
const BASE: string = (import.meta.env.BASE_URL as string | undefined) ?? '/';

export const HOST = NODE
  ? { yahoo: 'https://query1.finance.yahoo.com', fred: 'https://fred.stlouisfed.org', sec: 'https://www.sec.gov', secdata: 'https://data.sec.gov', fed: 'https://www.federalreserve.gov', cnbc: 'https://search.cnbc.com', mw: 'https://feeds.content.dowjones.io', bis: 'https://stats.bis.org', imf: 'https://www.imf.org', ff: 'https://nfs.faireconomy.media', boe: 'https://www.bankofengland.co.uk', mof: 'https://www.mof.go.jp', rba: 'https://www.rba.gov.au', nasdaq: 'https://api.nasdaq.com', finra: 'https://api.finra.org', adsb: 'https://api.adsb.lol', afi: 'https://opendata.adsb.fi/api' }
  : { yahoo: '/px/yahoo', fred: '/px/fred', sec: '/px/sec', secdata: '/px/xbrl', fed: '/px/fed', cnbc: '/px/cnbc', mw: '/px/mw', bis: '/px/bis', imf: '/px/imf', ff: '/px/ff', boe: '/px/boe', mof: '/px/mof', rba: '/px/rba', nasdaq: '/px/nasdaq', finra: '/px/finra', adsb: '/px/adsb', afi: '/px/afi' };

/** Snapshot files are JSON: { generated: epoch ms, data }. */
export interface Snap<T> { generated: number; data: T }
const generated = new Map<string, number>();
const cache = new Map<string, { at: number; p: Promise<unknown> }>();

/** Load a snapshot file (cached for 60 s so panels sharing a file make one request). */
export function snap<T>(name: string): Promise<T> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < 60_000) return hit.p as Promise<T>;
  const p = getText(`${BASE}snap/${name}?v=${Math.floor(Date.now() / 60_000)}`).then((t) => {
    const j = JSON.parse(t) as Snap<T>;
    generated.set(name, j.generated);
    return j.data;
  }).catch((e) => {
    cache.delete(name);
    throw /HTTP 404/.test(String(e)) ? new Error('not in this site’s data snapshot') : e;
  });
  cache.set(name, { at: Date.now(), p });
  return p;
}
export const snapTime = (name: string) => () => generated.get(name);

/** Flight data (cargo and military aircraft) is refreshed every couple of minutes by the "Live flights" job, which force-pushes
 *  the files to the repo's `flights` branch; raw.githubusercontent.com serves them with CORS (and a short cache, busted per
 *  minute here). The site's own snapshot is the fallback, and whichever copy is newer wins. */
export const LIVE_BASE = 'https://raw.githubusercontent.com/ldiazbusquets/parallax/flights/';
export async function liveSnap<T>(name: string): Promise<T> {
  const live = getText(`${LIVE_BASE}${name}?t=${Math.floor(Date.now() / 60_000)}`, { timeout: 12000 }).then((t) => JSON.parse(t) as Snap<T>).catch(() => undefined);
  const site = snap<T>(name).then((data) => ({ generated: generated.get(name) ?? 0, data })).catch(() => undefined);
  const [l, s] = await Promise.all([live, site]);
  const best = l && (!s || l.generated >= s.generated) ? l : s;
  if (!best) throw new Error('flight data unavailable');
  generated.set(name, best.generated);
  return best.data;
}
