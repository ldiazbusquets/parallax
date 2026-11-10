import { getJSON } from '@/lib/http';
import { isoDaysAgo } from '@/lib/format';
import type { SourceDef } from './store';

// Maritime chokepoints from IMF PortWatch (satellite AIS ship counts, updated weekly with daily rows).
// ArcGIS REST with CORS, so it loads live everywhere. Docs: portwatch.imf.org.
const PW = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services';

export interface Chokepoint { id: string; name: string; lat: number; lng: number; annual: number; topIndustries: string[] }
export interface Transit { d: string; total: number; tanker: number; container: number; bulk: number; capacity: number }
export interface ShippingData { points: Chokepoint[]; daily: Record<string, Transit[]>; last: string }

interface ArcRows<T> { features?: { attributes: T }[]; exceededTransferLimit?: boolean; error?: { message?: string } }
async function query<T>(service: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 50_000; ) {
    const qs = new URLSearchParams({ f: 'json', returnGeometry: 'false', resultOffset: String(offset), resultRecordCount: '1000', ...params });
    const j = await getJSON<ArcRows<T>>(`${PW}/${service}/FeatureServer/0/query?${qs}`, { timeout: 60000 });
    if (j.error) throw new Error('PortWatch: ' + (j.error.message ?? 'query failed'));
    const rows = (j.features ?? []).map((f) => f.attributes);
    out.push(...rows);
    if (!j.exceededTransferLimit || !rows.length) break;
    offset += rows.length;
  }
  return out;
}

interface DbRow { portid: string; portname: string; lat: number; lon: number; vessel_count_total: number; industry_top1?: string; industry_top2?: string; industry_top3?: string }
interface DayRow { portid: string; date: string | number; n_total: number; n_tanker: number; n_container: number; n_dry_bulk: number; capacity: number }
const isoDate = (d: string | number) => (typeof d === 'number' ? new Date(d).toISOString().slice(0, 10) : String(d).slice(0, 10));

export function shapeShipping(db: DbRow[], days: DayRow[]): ShippingData {
  const points = db.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => ({ id: r.portid, name: r.portname, lat: r.lat, lng: r.lon, annual: r.vessel_count_total ?? 0, topIndustries: [r.industry_top1, r.industry_top2, r.industry_top3].filter((x): x is string => !!x) }));
  const daily: Record<string, Transit[]> = {};
  let last = '';
  for (const r of days) {
    if (!Number.isFinite(r.n_total)) continue;
    const d = isoDate(r.date);
    (daily[r.portid] ||= []).push({ d, total: r.n_total, tanker: r.n_tanker ?? 0, container: r.n_container ?? 0, bulk: r.n_dry_bulk ?? 0, capacity: r.capacity ?? 0 });
    if (d > last) last = d;
  }
  for (const k in daily) daily[k].sort((a, b) => a.d.localeCompare(b.d));
  if (!points.length || !last) throw new Error('PortWatch returned no chokepoint data');
  return { points, daily, last };
}

/** Average daily transits over the 7 days ending `end` (inclusive), or null when fewer than 5 days are reported. */
export function weekAvg(s: Transit[] | undefined, end: string, key: keyof Omit<Transit, 'd'> = 'total'): number | null {
  if (!s) return null;
  const e = new Date(end + 'T00:00:00Z').getTime(), from = new Date(e - 6 * 864e5).toISOString().slice(0, 10);
  const w = s.filter((x) => x.d >= from && x.d <= end);
  return w.length >= 5 ? w.reduce((a, x) => a + x[key], 0) / w.length : null;
}
export const yearBefore = (d: string) => new Date(new Date(d + 'T00:00:00Z').getTime() - 364 * 864e5).toISOString().slice(0, 10);

export async function fetchShipping(): Promise<ShippingData> {
  const [db, days] = await Promise.all([
    query<DbRow>('PortWatch_chokepoints_database', { where: '1=1', outFields: 'portid,portname,lat,lon,vessel_count_total,industry_top1,industry_top2,industry_top3' }),
    // the last ~4 months (for the sparkline) and the same weeks a year earlier (for YoY); sorted here, not by the server
    query<DayRow>('Daily_Chokepoints_Data', { where: `(date >= DATE '${isoDaysAgo(125)}') OR (date >= DATE '${isoDaysAgo(390)}' AND date <= DATE '${isoDaysAgo(350)}')`, outFields: 'portid,date,n_total,n_tanker,n_container,n_dry_bulk,capacity' }),
  ]);
  return shapeShipping(db, days);
}
export const SHIPPING: SourceDef<ShippingData> = {
  id: 'portwatch:chokepoints', label: 'Shipping chokepoints', provider: 'IMF PortWatch', every: 6 * 60 * 60_000,
  fetch: () => fetchShipping(),
};

/** Shipping lanes (CIA World Oceans map, georeferenced by Benden, CC BY 4.0), simplified and served with the site. */
export const LANES_URL = './data/shipping-lanes.json';
