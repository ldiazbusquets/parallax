import { getJSON } from '@/lib/http';
import { isoDaysAgo } from '@/lib/format';
import { HOST, snap, snapTime, STATIC } from '@/lib/env';
import type { SourceDef } from './store';
import type { EventPoint } from './events';
import type { Hazard } from './hazards';
import type { Chokepoint } from './shipping';

// Phase 5: trade flows. Port traffic (IMF PortWatch, CORS, live), cargo flights near the big air-freight hubs
// (adsb.lol community ADS-B feed, no CORS: the site publishes a snapshot), and risk near shipping chokepoints.

// ============================ Ports (IMF PortWatch, satellite AIS port calls and estimated trade volumes)
const PW = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services';
export interface Port { id: string; name: string; country: string; iso3: string; lat: number; lng: number; annual: number; container: number; tanker: number }
export interface PortDay { d: string; calls: number; imp: number; exp: number }
export interface PortsData { ports: Port[]; daily: Record<string, PortDay[]>; last: string }
interface ArcRows<T> { features?: { attributes: T }[]; exceededTransferLimit?: boolean; error?: { message?: string } }
async function arc<T>(service: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 20_000; ) {
    const qs = new URLSearchParams({ f: 'json', returnGeometry: 'false', resultOffset: String(offset), resultRecordCount: '1000', ...params });
    const j = await getJSON<ArcRows<T>>(`${PW}/${service}/FeatureServer/0/query?${qs}`, { timeout: 30000 });
    if (j.error) throw new Error('PortWatch: ' + (j.error.message || 'query failed'));
    const rows = (j.features ?? []).map((f) => f.attributes);
    out.push(...rows);
    if (!j.exceededTransferLimit || !rows.length) break;
    offset += rows.length;
  }
  return out;
}
interface PortRow { portid: string; portname: string; country: string; ISO3: string; lat: number; lon: number; vessel_count_total: number; vessel_count_container: number; vessel_count_tanker: number }
interface PortDayRow { portid: string; date: string | number; portcalls: number; import: number; export: number }
const day = (d: string | number) => (typeof d === 'number' ? new Date(d).toISOString().slice(0, 10) : String(d).slice(0, 10));
export function shapePorts(db: PortRow[], rows: PortDayRow[]): PortsData {
  const ports = db.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon)).map((r) => ({ id: r.portid, name: r.portname, country: r.country, iso3: r.ISO3, lat: r.lat, lng: r.lon, annual: r.vessel_count_total ?? 0, container: r.vessel_count_container ?? 0, tanker: r.vessel_count_tanker ?? 0 }));
  const daily: Record<string, PortDay[]> = {};
  let last = '';
  for (const r of rows) {
    if (!Number.isFinite(r.portcalls)) continue;
    const d = day(r.date);
    (daily[r.portid] ||= []).push({ d, calls: r.portcalls, imp: r.import ?? 0, exp: r.export ?? 0 });
    if (d > last) last = d;
  }
  for (const k in daily) daily[k].sort((a, b) => a.d.localeCompare(b.d));
  if (!ports.length || !last) throw new Error('PortWatch returned no port data');
  return { ports, daily, last };
}
/** Average of `key` over the 7 days ending `end`, or null with fewer than 5 days reported. */
export function portWeek(s: PortDay[] | undefined, end: string, key: 'calls' | 'imp' | 'exp' = 'calls'): number | null {
  if (!s) return null;
  const e = Date.parse(end + 'T00:00:00Z'), from = new Date(e - 6 * 864e5).toISOString().slice(0, 10);
  const w = s.filter((x) => x.d >= from && x.d <= end);
  return w.length >= 5 ? w.reduce((a, x) => a + x[key], 0) / w.length : null;
}
export async function fetchPorts(n = 30): Promise<PortsData> {
  const db = await arc<PortRow>('PortWatch_ports_database', { where: '1=1', outFields: 'portid,portname,country,ISO3,lat,lon,vessel_count_total,vessel_count_container,vessel_count_tanker', orderByFields: 'vessel_count_total DESC', resultRecordCount: String(n) }).then((r) => r.slice(0, n));
  const ids = db.map((r) => `'${r.portid}'`).join(',');
  // the last ~4 months, plus the same weeks a year earlier for the year-on-year comparison
  const recent = `date >= DATE '${isoDaysAgo(120)}'`, yago = `date >= DATE '${isoDaysAgo(400)}' AND date <= DATE '${isoDaysAgo(345)}'`;
  const rows = await arc<PortDayRow>('Daily_Ports_Data', { where: `portid IN (${ids}) AND ((${recent}) OR (${yago}))`, outFields: 'portid,date,portcalls,import,export', orderByFields: 'date,portid' });
  return shapePorts(db, rows);
}
export const PORTS: SourceDef<PortsData> = {
  id: 'portwatch:ports', label: 'Port traffic', provider: 'IMF PortWatch', every: 6 * 60 * 60_000,
  fetch: () => fetchPorts(),
};

// ============================ Cargo flights (adsb.lol; aircraft within ~150 nm of each hub, cargo airlines only)
/** ICAO airline designators of all-cargo operators (passenger airlines' freighters can't be told apart by callsign). */
export const CARGO_AIRLINES: Record<string, string> = {
  FDX: 'FedEx', UPS: 'UPS', GTI: 'Atlas Air', CLX: 'Cargolux', CKS: 'Kalitta', ABX: 'ABX Air (Amazon/DHL)', ATN: 'ATI (Amazon)',
  BCS: 'DHL (EAT Leipzig)', DHK: 'DHL Air UK', DHX: 'DHL International', AHK: 'Air Hong Kong (DHL)', BOX: 'AeroLogic', GEC: 'Lufthansa Cargo',
  CAO: 'Air China Cargo', CKK: 'China Cargo Airlines', CSS: 'SF Airlines', YZR: 'YTO Cargo', NCA: 'Nippon Cargo', MPH: 'Martinair Cargo',
  SQC: 'Singapore Airlines Cargo', PAC: 'Polar Air Cargo', NCR: 'National Airlines', WGN: 'Western Global', TAY: 'ASL Belgium', SWN: 'West Atlantic',
  ICL: 'CAL Cargo', MSX: 'EgyptAir Cargo', CJT: 'Cargojet', SCX: 'Sun Country (Amazon)', KYE: 'Sky Lease Cargo', AJT: 'Amerijet', ABD: 'Air Atlanta Icelandic',
};
export const CARGO_HUBS: { code: string; name: string; lat: number; lng: number }[] = [
  { code: 'MEM', name: 'Memphis (FedEx)', lat: 35.04, lng: -89.98 }, { code: 'SDF', name: 'Louisville (UPS)', lat: 38.17, lng: -85.74 },
  { code: 'CVG', name: 'Cincinnati (Amazon, DHL)', lat: 39.05, lng: -84.67 }, { code: 'ANC', name: 'Anchorage', lat: 61.17, lng: -150.0 },
  { code: 'IND', name: 'Indianapolis (FedEx)', lat: 39.72, lng: -86.29 }, { code: 'MIA', name: 'Miami', lat: 25.79, lng: -80.29 },
  { code: 'ONT', name: 'Ontario CA (UPS)', lat: 34.06, lng: -117.6 }, { code: 'LEJ', name: 'Leipzig (DHL)', lat: 51.42, lng: 12.24 },
  { code: 'CGN', name: 'Cologne (UPS)', lat: 50.87, lng: 7.14 }, { code: 'LGG', name: 'Liège', lat: 50.64, lng: 5.44 },
  { code: 'LUX', name: 'Luxembourg (Cargolux)', lat: 49.63, lng: 6.21 }, { code: 'DXB', name: 'Dubai', lat: 25.25, lng: 55.36 },
  { code: 'DOH', name: 'Doha', lat: 25.27, lng: 51.61 }, { code: 'HKG', name: 'Hong Kong', lat: 22.31, lng: 113.92 },
  { code: 'ICN', name: 'Seoul Incheon', lat: 37.46, lng: 126.44 }, { code: 'TPE', name: 'Taipei', lat: 25.08, lng: 121.23 },
];
export interface Plane { hex: string; cs: string; op: string; type: string; lat: number; lng: number; alt: number | null; ground: boolean; track: number | null; hub: string }
export interface CargoData { at: number; planes: Plane[]; hubs: Record<string, { air: number; ground: number; ok: boolean }> }
interface AdsbAc { hex: string; flight?: string; t?: string; lat?: number; lon?: number; alt_baro?: number | 'ground'; track?: number }
/** Keep cargo-airline aircraft; the same aircraft near two hubs counts once (at the first hub). */
export function cargoFrom(hub: string, ac: AdsbAc[], seen: Set<string>): Plane[] {
  const out: Plane[] = [];
  for (const a of ac) {
    const cs = (a.flight ?? '').trim(), op = CARGO_AIRLINES[cs.slice(0, 3)];
    if (!op || !/^[A-Z]{3}\d/.test(cs) || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || seen.has(a.hex)) continue;
    seen.add(a.hex);
    out.push({ hex: a.hex, cs, op, type: a.t ?? '', lat: a.lat!, lng: a.lon!, alt: typeof a.alt_baro === 'number' ? a.alt_baro : null, ground: a.alt_baro === 'ground', track: a.track ?? null, hub });
  }
  return out;
}
export async function fetchCargo(gapMs = 3000): Promise<CargoData> {
  const planes: Plane[] = [], hubs: CargoData['hubs'] = {}, seen = new Set<string>();
  for (const h of CARGO_HUBS) {
    try {
      const j = await getJSON<{ ac?: AdsbAc[] }>(`${HOST.adsb}/v2/point/${h.lat}/${h.lng}/150`, { timeout: 15000 });
      const p = cargoFrom(h.code, j.ac ?? [], seen);
      planes.push(...p);
      hubs[h.code] = { air: p.filter((x) => !x.ground).length, ground: p.filter((x) => x.ground).length, ok: true };
    } catch { hubs[h.code] = { air: 0, ground: 0, ok: false }; }
    await new Promise((r) => setTimeout(r, gapMs)); // adsb.lol rate-limits bursts
  }
  if (!Object.values(hubs).some((x) => x.ok)) throw new Error('adsb.lol did not answer');
  return { at: Date.now(), planes, hubs };
}
export const CARGO: SourceDef<CargoData> = {
  id: 'adsb:cargo', label: 'Cargo flights', provider: 'adsb.lol (ADS-B Exchange community feed)', every: 15 * 60_000,
  asOf: STATIC ? snapTime('cargo.json') : undefined,
  fetch: () => (STATIC ? snap<CargoData>('cargo.json') : fetchCargo(1500)),
};

// ============================ Risk near chokepoints
const R = 6371;
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export interface ChokeRisk { id: string; conflict: number; unrest: number; sanctions: number; hazards: Hazard[]; places: string[] }
/** Fighting, not posture or threats: CAMEO 18x (assault), 19x (fight), 20x (mass violence). */
export const violent = (code: string) => /^(18|19|20)/.test(code);
/** Violent events, unrest and sanctions (GDELT, last 7 days) and alerted natural hazards within `radius` km of each
 *  chokepoint. GDELT points geocoded only to a whole country sit on its centroid, which says nothing about a strait,
 *  so those are left out; so are threats and military posture, which GDELT often places at capitals. */
export function chokeRisk(points: Chokepoint[], events: EventPoint[], hazards: Hazard[], radius = 300): ChokeRisk[] {
  return points.map((c) => {
    const r: ChokeRisk = { id: c.id, conflict: 0, unrest: 0, sanctions: 0, hazards: [], places: [] };
    const places = new Map<string, number>();
    for (const e of events) {
      if (!e.place.includes(',') || (e.cat === 'conflict' && !violent(e.code)) || km(c, e) > radius) continue;
      r[e.cat] += e.n;
      if (e.cat === 'conflict') places.set(e.place.split(',')[0], (places.get(e.place.split(',')[0]) ?? 0) + e.n);
    }
    r.hazards = hazards.filter((h) => (h.level === 'red' || h.level === 'orange') && km(c, h) <= radius);
    r.places = [...places.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
    return r;
  });
}
