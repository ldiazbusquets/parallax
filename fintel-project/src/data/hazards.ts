import { getJSON } from '@/lib/http';
import type { SourceDef } from './store';

// Natural hazards that can move markets: significant earthquakes and tsunami warnings (USGS), tropical cyclones,
// floods, volcanoes, droughts and wildfires with an Orange/Red impact alert (GDACS, the UN/EU disaster alert system),
// and large US wildfires (NASA EONET, from the federal IRWIN incident feed). All three allow browsers (CORS),
// so this loads live everywhere.

export type HazardKind = 'quake' | 'tsunami' | 'cyclone' | 'flood' | 'volcano' | 'drought' | 'wildfire';
export const HAZARD_LABEL: Record<HazardKind, string> = { quake: 'Earthquake', tsunami: 'Tsunami threat', cyclone: 'Tropical cyclone', flood: 'Flood', volcano: 'Volcano', drought: 'Drought', wildfire: 'Wildfire' };
export interface Hazard { id: string; kind: HazardKind; title: string; detail: string; lat: number; lng: number; t: number; level: 'red' | 'orange' | 'green' | null; src: 'USGS' | 'GDACS' | 'NASA EONET'; url: string; iso3?: string; mag?: number }

// ---------------- USGS earthquakes
interface UsgsFeature { id: string; properties: { mag: number | null; place: string | null; time: number; url: string; alert: string | null; tsunami: number; sig: number; title: string }; geometry: { coordinates: number[] } }
/** USGS's own "significant" list, plus anything M6+ or flagged for a possible tsunami. */
export function parseUsgs(feeds: { features?: UsgsFeature[] }[], significantIds: Set<string>): Hazard[] {
  const seen = new Map<string, Hazard>();
  for (const fc of feeds) for (const f of fc.features ?? []) {
    const p = f.properties, [lng, lat] = f.geometry?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || seen.has(f.id)) continue;
    const mag = p.mag ?? 0;
    if (!(significantIds.has(f.id) || mag >= 6 || p.tsunami === 1)) continue;
    const level = p.alert === 'red' ? 'red' : p.alert === 'orange' ? 'orange' : mag >= 7 ? 'orange' : null;
    seen.set(f.id, {
      id: 'usgs:' + f.id, kind: p.tsunami === 1 ? 'tsunami' : 'quake', mag,
      title: `M${mag.toFixed(1)} earthquake`, detail: `${p.place ?? 'Unknown location'}${p.tsunami === 1 ? ' · tsunami flag (check local warnings)' : ''}${p.alert ? ` · USGS impact alert: ${p.alert}` : ''}`,
      lat, lng, t: p.time, level, src: 'USGS', url: p.url,
    });
  }
  return [...seen.values()];
}

// ---------------- GDACS
interface GdacsFeature { geometry: { type: string; coordinates: number[] }; properties: { eventtype: string; eventid: number; name: string; alertlevel: string; iso3?: string; country?: string; fromdate: string; todate?: string; iscurrent?: string | boolean; severitydata?: { severitytext?: string }; url?: { report?: string } } }
const GDACS_KIND: Record<string, HazardKind> = { TC: 'cyclone', FL: 'flood', VO: 'volcano', DR: 'drought', WF: 'wildfire' };
export function parseGdacs(fc: { features?: GdacsFeature[] }): Hazard[] {
  const out: Hazard[] = [];
  for (const f of fc.features ?? []) {
    const p = f.properties, kind = GDACS_KIND[p.eventtype];
    if (!kind || f.geometry?.type !== 'Point') continue;
    const lvl = String(p.alertlevel).toLowerCase();
    if (lvl !== 'red' && lvl !== 'orange') continue; // Green = limited expected impact
    const [lng, lat] = f.geometry.coordinates;
    const t = Date.parse(p.fromdate + (p.fromdate.endsWith('Z') ? '' : 'Z'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(t)) continue;
    const where = (p.country ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    out.push({
      id: `gdacs:${p.eventtype}${p.eventid}`, kind, title: p.name.replace(/\s+/g, ' ').replace(/^(Drought|Flood|Forest fires?) in (.{60}).+$/, '$1 in $2…'),
      detail: [p.severitydata?.severitytext, where.length > 3 ? `${where.slice(0, 3).join(', ')} +${where.length - 3} more` : where.join(', ')].filter(Boolean).join(' · '),
      lat, lng, t, level: lvl as 'red' | 'orange', src: 'GDACS', url: p.url?.report || `https://www.gdacs.org/report.aspx?eventtype=${p.eventtype}&eventid=${p.eventid}`, iso3: p.iso3 || undefined,
    });
  }
  return out;
}

// ---------------- NASA EONET wildfires (mostly US incidents); prescribed burns are excluded
interface EonetEvent { id: string; title: string; description: string | null; link: string; sources?: { url: string }[]; geometry: { date: string; type: string; coordinates: number[]; magnitudeValue?: number | null; magnitudeUnit?: string | null }[] }
export function parseEonetFires(j: { events?: EonetEvent[] }, minAcres = 1000): Hazard[] {
  const out: Hazard[] = [];
  for (const e of j.events ?? []) {
    if (/prescribed|\bRX\b/i.test(e.title)) continue;
    const g = e.geometry?.[e.geometry.length - 1];
    if (!g || g.type !== 'Point') continue;
    const acres = g.magnitudeUnit === 'acres' ? g.magnitudeValue ?? 0 : 0;
    if (acres < minAcres) continue;
    const [lng, lat] = g.coordinates;
    out.push({ id: 'eonet:' + e.id, kind: 'wildfire', title: e.title.replace(/^Wildfire\s+/i, '') + ' fire', detail: `${Math.round(acres).toLocaleString('en-US')} acres${e.description ? ' · ' + e.description : ''}`, lat, lng, t: Date.parse(g.date), level: acres >= 50_000 ? 'red' : acres >= 10_000 ? 'orange' : null, src: 'NASA EONET', url: e.sources?.[0]?.url || e.link });
  }
  return out;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
export interface HazardsData { items: Hazard[]; errors: string[] }
export async function fetchHazards(now = new Date()): Promise<HazardsData> {
  const from = ymd(new Date(now.getTime() - 14 * 864e5)), to = ymd(new Date(now.getTime() + 864e5));
  const errors: string[] = [];
  const [w, sig, gd, eo] = await Promise.allSettled([
    getJSON<{ features: UsgsFeature[] }>('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'),
    getJSON<{ features: UsgsFeature[] }>('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson'),
    getJSON<{ features: GdacsFeature[] }>(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;VO;DR;WF&fromdate=${from}&todate=${to}&alertlevel=Orange;Red`),
    getJSON<{ events: EonetEvent[] }>('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&category=wildfires&limit=500'),
  ]);
  const items: Hazard[] = [];
  if (w.status === 'fulfilled' || sig.status === 'fulfilled') {
    const s = sig.status === 'fulfilled' ? sig.value : { features: [] };
    const cut = now.getTime() - 14 * 864e5;
    items.push(...parseUsgs([s, w.status === 'fulfilled' ? w.value : { features: [] }], new Set(s.features.map((f) => f.id))).filter((h) => h.t >= cut));
  } else errors.push('USGS: ' + (w.reason as Error)?.message);
  if (gd.status === 'fulfilled') items.push(...parseGdacs(gd.value)); else errors.push('GDACS: ' + (gd.reason as Error)?.message);
  if (eo.status === 'fulfilled') items.push(...parseEonetFires(eo.value)); else errors.push('NASA EONET: ' + (eo.reason as Error)?.message);
  if (errors.length === 3) throw new Error(errors.join('; '));
  const rank = (h: Hazard) => (h.level === 'red' ? 3 : h.level === 'orange' ? 2 : 1);
  return { items: items.sort((a, b) => rank(b) - rank(a) || b.t - a.t), errors };
}
export const HAZARDS: SourceDef<HazardsData> = {
  id: 'hazards', label: 'Natural hazards', provider: 'USGS · GDACS · NASA EONET', every: 30 * 60_000,
  fetch: () => fetchHazards(),
};
export const HAZARD_COLOR = '#3fd0c9';
