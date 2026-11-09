import { snap, snapTime, STATIC } from '@/lib/env';
import type { SourceDef } from './store';

// World events from the GDELT 2.0 event database (machine-coded from news worldwide, a new file every 15 min).
// The snapshot job keeps a rolling 24-hour window and publishes a summary (events.json); browsers can't fetch the
// raw zip files (no CORS), so every mode reads that summary.

// Only event types that can move markets are kept: armed conflict and military escalation, strikes/blockades/riots,
// and sanctions or embargoes. Street crime, arrests, ordinary protests and verbal threats are dropped, and an event
// must be reported by several articles (see `important`) so one-off miscodings don't reach the map.
export type EventCat = 'conflict' | 'unrest' | 'sanctions';
export const EVENT_CATS: { id: EventCat; label: string; color: string; hint: string }[] = [
  { id: 'conflict', label: 'War & conflict', color: '#ff5147', hint: 'Military force, air strikes, shelling, occupation, bombings, assassinations, mass violence, threats or shows of military force' },
  { id: 'unrest', label: 'Strikes & unrest', color: '#5aa9ff', hint: 'Strikes, boycotts, blockades and riots' },
  { id: 'sanctions', label: 'Sanctions', color: '#b48cff', hint: 'Sanctions, embargoes and trade boycotts' },
];

/** Plain-English labels for the CAMEO event codes we keep (most specific first). */
const CAMEO: Record<string, string> = {
  '13': 'Threat', '138': 'Threat of military force', '1384': 'Threat of attack', '139': 'Ultimatum',
  '14': 'Protest', '141': 'Demonstration or rally', '143': 'Strike or boycott', '144': 'Blockade', '145': 'Violent protest or riot',
  '15': 'Show of military force', '150': 'Military alert or posture', '152': 'Military mobilisation', '154': 'Military mobilisation',
  '163': 'Embargo, boycott or sanctions', '1631': 'Sanctions', '1632': 'Embargo',
  '17': 'Coercion', '171': 'Seizure or destruction of property', '172': 'Administrative sanctions', '173': 'Arrest or detention',
  '174': 'Expulsion or deportation', '175': 'Violent repression',
  '18': 'Assault', '180': 'Unconventional violence', '181': 'Abduction or hostage-taking', '182': 'Physical assault',
  '183': 'Bombing', '1831': 'Suicide bombing', '1832': 'Vehicle bombing', '1833': 'Roadside bombing', '184': 'Use of human shield', '186': 'Assassination',
  '19': 'Fighting', '190': 'Military force', '191': 'Blockade or restricted movement', '192': 'Occupation of territory',
  '193': 'Small-arms fighting', '194': 'Artillery and tank fighting', '195': 'Air strikes', '196': 'Ceasefire violation',
  '20': 'Mass violence', '200': 'Mass violence', '201': 'Mass expulsion', '202': 'Mass killing', '203': 'Ethnic cleansing', '204': 'Weapons of mass destruction',
};
export const cameoLabel = (code: string) => CAMEO[code] ?? CAMEO[code.slice(0, 3)] ?? CAMEO[code.slice(0, 2)] ?? 'Event';

export function categorise(root: string, code: string): EventCat | null {
  if (root === '19' || root === '20') return 'conflict';                       // fighting, mass violence
  if (/^(181|183|186)/.test(code)) return 'conflict';                            // hostage-taking, bombings, assassinations (not assaults/crime)
  if (root === '15' || /^(138|139)/.test(code)) return 'conflict';              // military posture/mobilisation, threats of force, ultimatums
  if (/^(143|144|145)/.test(code)) return 'unrest';                              // strikes and boycotts, blockades, riots
  if (code.startsWith('163')) return 'sanctions';                                // embargoes, boycotts, sanctions
  return null;
}
/** Re-apply today's categories to an event parsed under older rules (the job's cached window). */
export function recategorise(e: Ev): Ev | null {
  const c = categorise(e[2].slice(0, 2), e[2]);
  return c ? [e[0], c, ...e.slice(2)] as Ev : null;
}
/** Widely reported: at least 2 independent sources or 10 mentions. */
export const important = (e: Ev) => e[10] >= 2 || e[9] >= 10;

/** One event, compact: [time(ms), cat, code, lat, lng, place, fips, actor1, actor2, mentions, sources, url] */
export type Ev = [number, EventCat, string, number, number, string, string, string, string, number, number, string];

/** GDELT actor types that make violence a matter of war rather than crime: military, rebels, insurgents,
 *  separatists, irregular armed forces. (Police, criminals, businesses and civilians don't qualify.) */
const ARMED = /^(MIL|REB|INS|SEP|UAF)$/;
/** Is this a state-level event? Armed forces/groups on either side, or two different countries; never a criminal actor. */
export function stateLevel(f: string[]): boolean {
  const types = [f[12], f[13], f[14], f[22], f[23], f[24]];
  if (types.includes('CRM')) return false;
  if (types.some((t) => t && ARMED.test(t))) return true;
  return !!(f[7] && f[17] && f[7] !== f[17]); // cross-border
}
const stamp = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10) || 0, +s.slice(10, 12) || 0);

/** Parse one GDELT 2.0 export file (tab-separated, 61 columns). Keeps geolocated conflict/protest/coercion events
 *  that happened within `maxAgeDays` of being added and were mentioned at least `minMentions` times.
 *  Categories are applied again when summarising, so the cached window follows rule changes. */
export function parseGdeltExport(tsv: string, minMentions = 5, maxAgeDays = 7): Ev[] {
  const out: Ev[] = [];
  for (const line of tsv.split('\n')) {
    const f = line.split('\t');
    if (f.length < 61) continue;
    const cat = categorise(f[28], f[26]);
    if (!cat) continue;
    // fighting, threats and sanctions must involve armed forces, an armed group or two countries; strikes and riots needn't
    if (cat !== 'unrest' ? !stateLevel(f) : [f[12], f[22]].includes('CRM')) continue;
    const lat = parseFloat(f[56]), lng = parseFloat(f[57]), mentions = +f[31] || 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0) || mentions < minMentions) continue;
    const added = stamp(f[59]), happened = stamp(f[1]);
    if (!added || added - happened > maxAgeDays * 86_400_000) continue; // news about old events
    out.push([added, cat, f[26], Math.round(lat * 100) / 100, Math.round(lng * 100) / 100, f[52], f[53], f[6], f[16], mentions, +f[32] || 0, f[60].trim()]);
  }
  return out;
}

export interface EventPoint { lat: number; lng: number; cat: EventCat; n: number; m: number; place: string; fips: string; last: number; code: string; url: string }
export interface EventItem { t: number; cat: EventCat; label: string; place: string; fips: string; a1: string; a2: string; m: number; url: string; lat: number; lng: number }
export interface EventsData { from: number; to: number; total: number; byCat: Record<EventCat, number>; points: EventPoint[]; top: EventItem[]; byCountry: Record<string, { n: number; byCat: Record<EventCat, number>; top: EventItem[] }> }

const item = (e: Ev): EventItem => ({ t: e[0], cat: e[1], label: cameoLabel(e[2]), place: e[5], fips: e[6], a1: e[7], a2: e[8], m: e[9], url: e[11], lat: e[3], lng: e[4] });
const zero = (): Record<EventCat, number> => ({ conflict: 0, unrest: 0, sanctions: 0 });
/** One event per source article (the same story is often coded several times). */
function dedupe(evs: Ev[]) {
  const best = new Map<string, Ev>();
  for (const e of evs) { const k = e[11] + '|' + e[1]; const b = best.get(k); if (!b || e[9] > b[9]) best.set(k, e); }
  return [...best.values()];
}

/** Summarise a window of events: map points (merged by place and category), the most-covered events, and per country. */
export function summariseEvents(all: Ev[], topN = 80, perCountry = 12): EventsData {
  const evs = all.flatMap((e) => { const r = recategorise(e); return r && important(r) ? [r] : []; });
  const byCat = zero();
  const pts = new Map<string, EventPoint>();
  for (const e of evs) {
    byCat[e[1]]++;
    const k = `${e[3]},${e[4]},${e[1]}`;
    const p = pts.get(k);
    if (p) { p.n++; p.m += e[9]; if (e[0] > p.last) p.last = e[0]; if (e[9] > 0 && !p.url) p.url = e[11]; }
    else pts.set(k, { lat: e[3], lng: e[4], cat: e[1], n: 1, m: e[9], place: e[5], fips: e[6], last: e[0], code: e[2], url: e[11] });
  }
  const unique = dedupe(evs).sort((a, b) => b[9] - a[9] || b[0] - a[0]);
  const byCountry: EventsData['byCountry'] = {};
  for (const e of evs) { const c = (byCountry[e[6]] ||= { n: 0, byCat: zero(), top: [] }); c.n++; c.byCat[e[1]]++; }
  for (const e of unique) { const c = byCountry[e[6]]; if (c && c.top.length < perCountry) c.top.push(item(e)); }
  delete byCountry[''];
  const times = evs.map((e) => e[0]);
  return {
    from: times.length ? Math.min(...times) : 0, to: times.length ? Math.max(...times) : 0, total: evs.length, byCat,
    points: [...pts.values()].sort((a, b) => b.m - a.m).slice(0, 4000),
    top: unique.slice(0, topN).map(item), byCountry,
  };
}

export const EVENTS: SourceDef<EventsData> = {
  id: 'gdelt:events', label: 'World events', provider: 'GDELT', every: 15 * 60_000,
  asOf: STATIC ? snapTime('events.json') : undefined,
  fetch: () => snap<EventsData>('events.json'),
};

/** GDELT country codes (FIPS 10-4) for the countries on the map. */
export const FIPS: Record<string, string> = {
  USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR', CHL: 'CI', COL: 'CO', PER: 'PE', GBR: 'UK', DEU: 'GM', FRA: 'FR',
  ITA: 'IT', ESP: 'SP', NLD: 'NL', CHE: 'SZ', SWE: 'SW', DNK: 'DA', NOR: 'NO', FIN: 'FI', IRL: 'EI', PRT: 'PO', GRC: 'GR',
  AUT: 'AU', BEL: 'BE', POL: 'PL', CZE: 'EZ', HUN: 'HU', TUR: 'TU', ISR: 'IS', SAU: 'SA', ARE: 'AE', QAT: 'QA', KWT: 'KU',
  EGY: 'EG', MAR: 'MO', NGA: 'NI', GHA: 'GH', KEN: 'KE', ZAF: 'SF', RUS: 'RS', IND: 'IN', PAK: 'PK', BGD: 'BG', CHN: 'CH',
  HKG: 'HK', JPN: 'JA', KOR: 'KS', TWN: 'TW', SGP: 'SN', IDN: 'ID', THA: 'TH', MYS: 'MY', VNM: 'VM', PHL: 'RP', AUS: 'AS', NZL: 'NZ',
};
