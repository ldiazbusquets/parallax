import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, FeatureCollection } from 'geojson';
import countriesUrl from 'world-atlas/countries-50m.json?url';
import { isStaleQuote, useQuotes } from '@/data/yahoo';
import { useSource } from '@/data/store';
import { EVENT_CATS, EVENTS, FIPS, cameoLabel, type EventCat, type EventsData } from '@/data/events';
import { IMF, IMF_INDICATORS, POLICY, WB_INDICATORS, worldBankSource, type ImfData } from '@/data/sources';
import { bondId, policyArea, COUNTRIES, type Country } from '@/data/universe';
import { HAZARDS, HAZARD_COLOR, HAZARD_LABEL, type Hazard } from '@/data/hazards';
import { LANES_URL, SHIPPING, weekAvg, yearBefore, type ShippingData } from '@/data/shipping';
import { FRED_MACRO } from '@/data/fred';
import { big, num, price } from '@/lib/format';
import { Chg, Panel, Tabs } from '@/ui/kit';
import { heat } from '@/ui/theme';

// Keyless dark basemap (CARTO). If a Protomaps key is set in .env (VITE_PROTOMAPS_KEY), its style is used instead.
const PM_KEY = import.meta.env.VITE_PROTOMAPS_KEY as string | undefined;
const DARK = PM_KEY ? `https://api.protomaps.com/styles/v2/black.json?key=${PM_KEY}` : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
// Satellite: Esri World Imagery (free with attribution), toned down so markers and cards stay legible.
const SAT: maplibregl.StyleSpecification = {
  version: 8,
  sources: { sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 17, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' } },
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0c0c0c' } }, { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.45, 'raster-brightness-max': 0.62, 'raster-contrast': 0.12 } }],
};
type Base = 'sat' | 'dark';
const baseKey = 'fintel.mapbase';
const savedBase = (): Base => { try { return localStorage.getItem(baseKey) === 'dark' ? 'dark' : 'sat'; } catch { return 'sat'; } };
// Camera per country: big countries are framed on their middle rather than the capital, small ones zoom closer.
const VIEW: Record<string, [number, number, number]> = {
  USA: [-97, 38.5, 2.75], CAN: [-98, 58, 2.5], MEX: [-102, 23.5, 3.9], BRA: [-52, -12, 3.1], ARG: [-64, -37, 3.1],
  CHL: [-71, -36, 3.2], COL: [-73.5, 4.5, 4.4], PER: [-75, -9.5, 4.2], RUS: [95, 62, 1.9], CHN: [104, 35, 3],
  IND: [79, 22, 3.6], IDN: [118, -2.5, 3.4], AUS: [134, -26, 3.1], NZL: [172.5, -41.5, 4.4], SAU: [45, 24, 4.3],
  ZAF: [25, -29, 4.4], EGY: [30, 26.5, 4.6], NGA: [8, 9.5, 4.6], KEN: [38, 0.5, 5], MAR: [-6.5, 31.5, 4.8],
  GHA: [-1, 8, 5.4], PAK: [69.5, 30, 4.4], TUR: [35, 39, 4.6], JPN: [138, 37, 4.2], SWE: [16, 62, 3.9],
  NOR: [12, 64, 3.6], FIN: [26, 64.5, 3.9], FRA: [2.5, 46.5, 4.8], DEU: [10.4, 51.2, 5], ESP: [-3.7, 40.2, 5],
  ITA: [12.5, 42.5, 4.8], GBR: [-2.5, 54, 4.8], POL: [19.4, 52, 5.1], VNM: [106, 16, 4.4], THA: [101, 13.5, 4.6],
  MYS: [109, 4, 4.5], PHL: [122, 12, 4.6], KOR: [127.8, 36.3, 5.6], TWN: [121, 23.7, 6], BGD: [90.3, 23.7, 5.8],
};
const SMALL = new Set(['SGP', 'HKG', 'QAT', 'KWT', 'ISR', 'BEL', 'NLD', 'CHE', 'AUT', 'CZE', 'HUN', 'DNK', 'IRL', 'PRT', 'GRC', 'ARE']);
const viewFor = (c: Country): [number, number, number] => VIEW[c.iso3] ?? [c.lng, c.lat, SMALL.has(c.iso3) ? (['SGP', 'HKG'].includes(c.iso3) ? 8 : 6.2) : 5];
/** Leave room for the country card on the right (desktop); on phones it sits below the map. */
const cardPad = () => (typeof window !== 'undefined' && window.innerWidth > 760 ? { top: 90, bottom: 40, left: 40, right: 330 } : { top: 40, bottom: 20, left: 20, right: 20 });

// Country outlines: Natural Earth 1:50m admin-0 shapes (world-atlas, public domain), keyed by ISO 3166 numeric code.
const NUM: Record<string, string> = {
  USA: '840', CAN: '124', MEX: '484', BRA: '076', ARG: '032', CHL: '152', COL: '170', PER: '604', GBR: '826', DEU: '276',
  FRA: '250', ITA: '380', ESP: '724', NLD: '528', CHE: '756', SWE: '752', DNK: '208', NOR: '578', FIN: '246', IRL: '372',
  PRT: '620', GRC: '300', AUT: '040', BEL: '056', POL: '616', CZE: '203', HUN: '348', TUR: '792', ISR: '376', SAU: '682',
  ARE: '784', QAT: '634', KWT: '414', EGY: '818', MAR: '504', NGA: '566', GHA: '288', KEN: '404', ZAF: '710', RUS: '643',
  IND: '356', PAK: '586', BGD: '050', CHN: '156', HKG: '344', JPN: '392', KOR: '410', TWN: '158', SGP: '702', IDN: '360',
  THA: '764', MYS: '458', VNM: '704', PHL: '608', AUS: '036', NZL: '554',
};
const ISO_BY_NUM = Object.fromEntries(Object.entries(NUM).map(([k, v]) => [v, k]));
/** Rings that cross the 180° meridian (Russia's Chukotka) jump from +180 to -180 and draw lines across the
 *  whole map. Shift their western half by +360° so the ring is continuous (MapLibre accepts lng > 180). */
function unwrap(f: Feature): Feature {
  const fix = (ring: number[][]) => {
    let lo = Infinity, hi = -Infinity;
    for (const [x] of ring) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    return hi - lo > 180 ? ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]) : ring;
  };
  const g = f.geometry;
  if (g.type === 'Polygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map(fix) } };
  if (g.type === 'MultiPolygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map((p) => p.map(fix)) } };
  return f;
}
let shapes: Promise<Map<string, Feature>> | null = null;
/** Tracked countries' outlines, keyed by ISO3 (loaded once, ~230 KB gzipped, only when the map is shown). */
function countryShapes() {
  shapes ||= fetch(countriesUrl).then((r) => r.json()).then((t: Topology<{ countries: GeometryCollection }>) => {
    const fc = feature(t, t.objects.countries) as FeatureCollection;
    const out = new Map<string, Feature>();
    for (const f of fc.features) { const iso = ISO_BY_NUM[String(f.id)]; if (iso) out.set(iso, { ...unwrap(f), properties: { iso3: iso } }); }
    return out;
  });
  return shapes;
}
/** Bounds of a country's main landmass(es): polygons at least a quarter the size of the largest, so far-off
 *  islands and territories don't zoom the camera out. */
function mainBounds(f: Feature): [[number, number], [number, number]] | null {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const area = (r: number[][]) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const items = polys.map((p) => ({ ring: p[0], a: area(p[0]) }));
  const max = Math.max(0, ...items.map((i) => i.a));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) if (it.a >= max * 0.25) for (const [x, y] of it.ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return Number.isFinite(x0) && x1 - x0 < 180 ? [[x0, y0], [x1, y1]] : null; // wider than 180° means it crosses the antimeridian
}
// Countries whose shapes mislead a bounding box (Alaska and Hawaii, Russia across the antimeridian, Svalbard)
const FIXED = new Set(['USA', 'RUS', 'NOR']);
/** Point the camera at a country: fit its real borders when we have them, otherwise the preset view. */
function frame(m: maplibregl.Map, c: Country, shape: Feature | undefined, animate: boolean) {
  const pad = cardPad();
  m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 }); // padding persists on the map and would stack with fitBounds'
  const b = shape && !FIXED.has(c.iso3) ? mainBounds(shape) : null;
  if (b) { m.fitBounds(b, { padding: pad, maxZoom: 7, duration: animate ? 1600 : 0, essential: true }); return; }
  const v = viewFor(c);
  if (animate) m.flyTo({ center: [v[0], v[1]], zoom: v[2], padding: pad, speed: 1.4, curve: 1.5, essential: true });
  else m.jumpTo({ center: [v[0], v[1]], zoom: v[2], padding: pad });
}
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
/** Add the outline layers (again after a basemap switch, which drops custom layers). */
/** GDELT event points as GeoJSON, filtered to the categories switched on. */
function eventsGeo(d: EventsData | undefined, cats: Set<EventCat>): FeatureCollection {
  if (!d) return EMPTY;
  return { type: 'FeatureCollection', features: d.points.filter((p) => cats.has(p.cat)).map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { cat: p.cat, n: p.n, m: p.m, place: p.place, code: p.code, url: p.url, last: p.last } })) };
}
const CAT_COLOR: maplibregl.ExpressionSpecification = ['match', ['get', 'cat'], ...EVENT_CATS.flatMap((c) => [c.id, c.color]), '#999999'] as unknown as maplibregl.ExpressionSpecification;
function addEventLayers(m: maplibregl.Map, data: FeatureCollection, visible: boolean) {
  if (!m.isStyleLoaded() || m.getSource('events')) return;
  m.addSource('events', { type: 'geojson', data });
  const before = m.getLayer('sel-fill') ? 'sel-fill' : undefined;
  const r: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['sqrt', ['get', 'm']], 1.7, 2.2, 6, 4.5, 15, 9, 40, 16];
  m.addLayer({ id: 'events-glow', type: 'circle', source: 'events', layout: { visibility: visible ? 'visible' : 'none' }, paint: { 'circle-color': CAT_COLOR, 'circle-radius': ['*', r, 2.2], 'circle-opacity': 0.12, 'circle-blur': 1 } }, before);
  m.addLayer({ id: 'events', type: 'circle', source: 'events', layout: { visibility: visible ? 'visible' : 'none' }, paint: { 'circle-color': CAT_COLOR, 'circle-radius': r, 'circle-opacity': 0.85, 'circle-stroke-color': '#0c0c0c', 'circle-stroke-width': 0.6 } }, before);
}
/** Natural hazards (USGS, GDACS, NASA EONET) as teal rings: bigger and brighter for Red/Orange alerts. */
function hazardsGeo(items: Hazard[] | undefined): FeatureCollection {
  return { type: 'FeatureCollection', features: (items ?? []).map((h) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [h.lng, h.lat] }, properties: { id: h.id, kind: h.kind, title: h.title, detail: h.detail, level: h.level ?? 'none', src: h.src, url: h.url, t: h.t } })) };
}
/** PortWatch chokepoints: circles sized by last week's average daily transits. */
function chokeGeo(d: ShippingData | undefined): FeatureCollection {
  if (!d) return EMPTY;
  return { type: 'FeatureCollection', features: d.points.map((p) => {
    const s = d.daily[p.id], now = weekAvg(s, d.last), prev = weekAvg(s, yearBefore(d.last));
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { name: p.name, now: now ?? 0, yoy: now != null && prev ? (now / prev - 1) * 100 : null, last: d.last, ind: p.topIndustries.slice(0, 2).join(', ') } };
  }) };
}
interface Overlays { events: FeatureCollection; showEv: boolean; hazards: FeatureCollection; showHz: boolean; lanes: FeatureCollection; choke: FeatureCollection; showShip: boolean }
const vis = (on: boolean) => (on ? 'visible' : 'none') as 'visible' | 'none';
function addOverlayLayers(m: maplibregl.Map, o: Overlays) {
  if (!m.isStyleLoaded() || m.getSource('hazards')) return;
  const before = m.getLayer('sel-fill') ? 'sel-fill' : undefined;
  m.addSource('lanes', { type: 'geojson', data: o.lanes });
  m.addLayer({ id: 'lanes', type: 'line', source: 'lanes', layout: { visibility: vis(o.showShip), 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#9fc3ff', 'line-opacity': ['match', ['get', 'type'], 'Major', 0.55, 'Middle', 0.32, 0.18], 'line-width': ['match', ['get', 'type'], 'Major', 1.6, 'Middle', 1, 0.6] } }, before);
  m.addSource('choke', { type: 'geojson', data: o.choke });
  const cr: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['get', 'now'], 0, 4, 50, 7, 150, 11, 300, 15];
  m.addLayer({ id: 'choke-glow', type: 'circle', source: 'choke', layout: { visibility: vis(o.showShip) }, paint: { 'circle-color': '#9fc3ff', 'circle-radius': ['*', cr, 1.9], 'circle-opacity': 0.12, 'circle-blur': 1 } }, before);
  m.addLayer({ id: 'choke', type: 'circle', source: 'choke', layout: { visibility: vis(o.showShip) }, paint: { 'circle-color': '#0c0c0c', 'circle-opacity': 0.55, 'circle-radius': cr, 'circle-stroke-color': '#cfe0ff', 'circle-stroke-width': 1.6 } });
  m.addSource('hazards', { type: 'geojson', data: o.hazards });
  const hr: maplibregl.ExpressionSpecification = ['match', ['get', 'level'], 'red', 11, 'orange', 8, 6];
  m.addLayer({ id: 'hazards-glow', type: 'circle', source: 'hazards', layout: { visibility: vis(o.showHz) }, paint: { 'circle-color': HAZARD_COLOR, 'circle-radius': ['*', hr, 2.4], 'circle-opacity': ['match', ['get', 'level'], 'red', 0.22, 0.12], 'circle-blur': 1 } });
  m.addLayer({ id: 'hazards', type: 'circle', source: 'hazards', layout: { visibility: vis(o.showHz) }, paint: { 'circle-color': HAZARD_COLOR, 'circle-opacity': 0.25, 'circle-radius': hr, 'circle-stroke-color': HAZARD_COLOR, 'circle-stroke-width': ['match', ['get', 'level'], 'red', 2.4, 1.6] } });
}
function popup(m: maplibregl.Map, at: maplibregl.LngLat, title: string, lines: string[], link?: { url: string; text: string }) {
  const box = document.createElement('div');
  box.className = 'ev-pop';
  const h = document.createElement('b'); h.textContent = title; box.append(h);
  for (const l of lines.filter(Boolean)) { const d = document.createElement('div'); d.textContent = l; box.append(d); }
  if (link?.url) { const a = document.createElement('a'); a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.text; box.append(a); }
  new maplibregl.Popup({ offset: 10, closeButton: false, maxWidth: '300px' }).setLngLat(at).setDOMContent(box).addTo(m);
}

function addBorderLayers(m: maplibregl.Map, all: Map<string, Feature> | null, selIso: string | undefined) {
  if (!m.isStyleLoaded() || m.getSource('sel-border')) return;
  m.addSource('tracked', { type: 'geojson', data: all ? { type: 'FeatureCollection', features: [...all.values()] } : EMPTY });
  m.addLayer({ id: 'tracked-hit', type: 'fill', source: 'tracked', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0 } });
  const f = selIso ? all?.get(selIso) : undefined;
  m.addSource('sel-border', { type: 'geojson', data: f ? { type: 'FeatureCollection', features: [f] } : EMPTY });
  m.addLayer({ id: 'sel-fill', type: 'fill', source: 'sel-border', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.07 } });
  m.addLayer({ id: 'sel-glow', type: 'line', source: 'sel-border', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.14, 'line-blur': 5 } });
  m.addLayer({ id: 'sel-line', type: 'line', source: 'sel-border', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.95 } });
}

const WB = worldBankSource(COUNTRIES.map((c) => c.iso3).filter((c) => c !== 'TWN'));

export function WorldMap() {
  const symbols = useMemo(() => COUNTRIES.flatMap((c) => [c.index?.[0], c.fx?.[0]]).filter(Boolean) as string[], []);
  const q = useQuotes(symbols);
  const wb = useSource(WB);
  const fred = useSource(FRED_MACRO);
  const pol = useSource(POLICY);
  const imf = useSource(IMF);
  const [fundTab, setFundTab] = useState<'imf' | 'wb'>('imf');
  const ev = useSource(EVENTS);
  const [showEv, setShowEv] = useState(true);
  const [evCats, setEvCats] = useState<Set<EventCat>>(() => new Set(EVENT_CATS.map((c) => c.id)));
  const evRef = useRef({ data: EMPTY as FeatureCollection, show: true });
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, HTMLDivElement>>(new Map());
  const [sel, setSel] = useState<Country | null>(COUNTRIES[0]);
  const hz = useSource(HAZARDS);
  const ship = useSource(SHIPPING);
  const [showShip, setShowShip] = useState(true);
  const [showHz, setShowHz] = useState(true);
  const lanesRef = useRef<FeatureCollection>(EMPTY);
  const ovRef = useRef<Overlays>({ events: EMPTY, showEv: true, hazards: EMPTY, showHz: true, lanes: EMPTY, choke: EMPTY, showShip: true });
  const [mapErr, setMapErr] = useState('');
  const [base, setBase] = useState<Base>(savedBase);
  const shapesRef = useRef<Map<string, Feature> | null>(null);
  const selRef = useRef<Country | null>(sel);

  useEffect(() => {
    if (!box.current) return;
    let m: maplibregl.Map;
    try {
      const v0 = viewFor(sel ?? COUNTRIES[0]);
      m = new maplibregl.Map({ container: box.current, style: base === 'sat' ? SAT : DARK, center: [v0[0], v0[1]], zoom: v0[2], minZoom: 0.8, maxZoom: 9, attributionControl: { compact: true }, renderWorldCopies: false, dragRotate: false });
    } catch (e) { setMapErr('Map needs WebGL, which this browser has turned off.'); return; }
    map.current = m;
    m.once('load', () => frame(m, selRef.current ?? COUNTRIES[0], undefined, false));
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    // outlines: drawn once the style and shapes are ready, and again after a basemap switch
    m.on('load', () => { countryShapes().then((all) => { shapesRef.current = all; addBorderLayers(m, all, selRef.current?.iso3); if (selRef.current) frame(m, selRef.current, all.get(selRef.current.iso3), false); }).catch(() => { /* outlines are optional */ }); });
    m.on('styledata', () => { if (shapesRef.current) addBorderLayers(m, shapesRef.current, selRef.current?.iso3); addEventLayers(m, evRef.current.data, evRef.current.show); addOverlayLayers(m, ovRef.current); });
    m.on('load', () => { addEventLayers(m, evRef.current.data, evRef.current.show); addOverlayLayers(m, ovRef.current); });
    m.on('click', 'hazards', (e) => {
      const p = e.features?.[0]?.properties as { kind: keyof typeof HAZARD_LABEL; title: string; detail: string; level: string; src: string; url: string; t: number } | undefined;
      if (!p) return;
      popup(m, e.lngLat, p.title, [`${HAZARD_LABEL[p.kind]}${p.level !== 'none' ? ` · ${p.level} alert` : ''} · ${new Date(Number(p.t)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, p.detail], { url: p.url, text: p.src + ' ↗' });
    });
    m.on('click', 'choke', (e) => {
      const p = e.features?.[0]?.properties as { name: string; now: number; yoy: number | null | string; last: string; ind: string } | undefined;
      if (!p) return;
      const yoy = p.yoy == null || p.yoy === 'null' ? null : Number(p.yoy);
      popup(m, e.lngLat, p.name, [`${Number(p.now).toFixed(0)} ships a day (7 days to ${new Date(p.last + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})${yoy != null ? ` · ${yoy >= 0 ? '+' : ''}${yoy.toFixed(0)}% vs a year ago` : ''}`, p.ind ? 'Main cargo: ' + p.ind : ''], { url: 'https://portwatch.imf.org/', text: 'IMF PortWatch ↗' });
    });
    for (const id of ['hazards', 'choke']) { m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer'; }); m.on('mouseleave', id, () => { m.getCanvas().style.cursor = ''; }); }
    m.on('click', 'events', (e) => {
      const p = e.features?.[0]?.properties as { cat: EventCat; n: number; m: number; place: string; code: string; url: string } | undefined;
      if (!p) return;
      const cat = EVENT_CATS.find((c) => c.id === p.cat);
      const box = document.createElement('div');
      box.className = 'ev-pop';
      const h = document.createElement('b'); h.textContent = cameoLabel(String(p.code)); box.append(h);
      const meta = document.createElement('div'); meta.textContent = `${p.place} · ${cat?.label ?? ''} · ${p.n} event${p.n > 1 ? 's' : ''}, ${p.m} mentions (24h)`; box.append(meta);
      if (p.url) { const a = document.createElement('a'); a.href = p.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; try { a.textContent = new URL(p.url).hostname.replace(/^www\./, '') + ' ↗'; } catch { a.textContent = 'source ↗'; } box.append(a); }
      new maplibregl.Popup({ offset: 10, closeButton: false, maxWidth: '280px' }).setLngLat(e.lngLat).setDOMContent(box).addTo(m);
    });
    m.on('mouseenter', 'events', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'events', () => { m.getCanvas().style.cursor = ''; });
    m.on('click', 'tracked-hit', (e) => { const top = ['events', 'hazards', 'choke'].filter((l) => m.getLayer(l)); if (top.length && m.queryRenderedFeatures(e.point, { layers: top }).length) return; const iso = e.features?.[0]?.properties?.iso3 as string | undefined; const c = COUNTRIES.find((x) => x.iso3 === iso); if (c) setSel(c); });
    m.on('mouseenter', 'tracked-hit', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'tracked-hit', () => { m.getCanvas().style.cursor = ''; });
    m.on('error', (e) => { if (String(e.error?.message || '').match(/style|Failed to fetch/i)) setMapErr('Map tiles could not load.'); });
    for (const c of COUNTRIES) {
      const el = document.createElement('div');
      el.className = 'mk';
      el.title = c.name;
      el.addEventListener('click', (e) => { e.stopPropagation(); setSel(c); });
      // keep the map from also treating a marker click as a click on the shape underneath
      for (const t of ['mousedown', 'mouseup', 'touchstart', 'touchend'] as const) el.addEventListener(t, (e) => e.stopPropagation());
      markers.current.set(c.iso3, el);
      new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(m);
    }
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); markers.current.clear(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // events layer: data, category filter and visibility
  useEffect(() => {
    evRef.current = { data: eventsGeo(ev.data, evCats), show: showEv };
    const m = map.current; if (!m) return;
    (m.getSource('events') as maplibregl.GeoJSONSource | undefined)?.setData(evRef.current.data);
    for (const id of ['events', 'events-glow']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', showEv ? 'visible' : 'none');
  }, [ev.data, evCats, showEv]);
  // other panels (the events feed) can point the map at a place
  useEffect(() => {
    const f = (e: Event) => {
      const { lat, lng, iso3 } = (e as CustomEvent<{ lat: number; lng: number; iso3?: string }>).detail;
      const c = iso3 ? COUNTRIES.find((x) => x.iso3 === iso3) : undefined;
      if (c) setSel(c);
      setTimeout(() => map.current?.flyTo({ center: [lng, lat], zoom: 5.5, padding: cardPad(), essential: true }), c ? 1700 : 0);
    };
    addEventListener('fintel:map-focus', f); return () => removeEventListener('fintel:map-focus', f);
  }, []);

  const switchBase = (b: Base) => { setBase(b); try { localStorage.setItem(baseKey, b); } catch { /* private mode */ } map.current?.setStyle(b === 'sat' ? SAT : DARK); setMapErr(''); };

  // colour markers by the local index's daily change (or currency if there's no index)
  useEffect(() => {
    for (const c of COUNTRIES) {
      const el = markers.current.get(c.iso3);
      if (!el) continue;
      const iq = c.index ? q.data?.[c.index[0]] : undefined;
      el.style.background = heat(iq?.changePct ?? null, 2);
      el.classList.toggle('sel', sel?.iso3 === c.iso3);
    }
  }, [q.data, sel]);
  // fly to the selected country so the map is always over it
  const first = useRef(true);
  useEffect(() => {
    const m = map.current;
    selRef.current = sel;
    // outline the selected country
    const src = m?.getSource('sel-border') as maplibregl.GeoJSONSource | undefined;
    const f = sel ? shapesRef.current?.get(sel.iso3) : undefined;
    src?.setData(f ? { type: 'FeatureCollection', features: [f] } : EMPTY);
    if (!m) return;
    if (!sel) { m.flyTo({ center: [20, 25], zoom: 1.15, padding: { top: 0, bottom: 0, left: 0, right: 0 }, essential: true }); return; } // card closed: back to the world
    if (first.current) { first.current = false; return; } // initial view is set on load
    frame(m, sel, shapesRef.current?.get(sel.iso3), true);
  }, [sel]);
  // shipping lanes are a static file: load it the first time the layer is on
  useEffect(() => {
    if (!showShip || lanesRef.current !== EMPTY) return;
    fetch(LANES_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then((fc: FeatureCollection) => {
      lanesRef.current = fc; ovRef.current = { ...ovRef.current, lanes: fc };
      (map.current?.getSource('lanes') as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    }).catch(() => { /* lanes are decoration around real chokepoint data; skip if missing */ });
  }, [showShip]);
  // hazards and chokepoints: data and visibility
  useEffect(() => {
    ovRef.current = { ...ovRef.current, hazards: hazardsGeo(hz.data?.items), showHz, choke: chokeGeo(ship.data), showShip, lanes: lanesRef.current };
    const m = map.current; if (!m) return;
    (m.getSource('hazards') as maplibregl.GeoJSONSource | undefined)?.setData(ovRef.current.hazards);
    (m.getSource('choke') as maplibregl.GeoJSONSource | undefined)?.setData(ovRef.current.choke);
    for (const id of ['hazards', 'hazards-glow']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis(showHz));
    for (const id of ['lanes', 'choke', 'choke-glow']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis(showShip));
  }, [hz.data, ship.data, showHz, showShip]);

  const iq = sel?.index ? q.data?.[sel.index[0]] : undefined;
  const fq = sel?.fx ? q.data?.[sel.fx[0]] : undefined;
  const fund = sel ? wb.data?.[sel.iso3] : undefined;
  const bs = sel && bondId(sel) ? fred.data?.[bondId(sel)!] : undefined;
  const bond = bs?.length ? bs[bs.length - 1] : undefined;
  const pr = sel ? pol.data?.[policyArea(sel) ?? ''] : undefined;
  const bondPrev = bs && bs.length > 12 ? bs[bs.length - 13] : undefined;
  return (
    <Panel id="p-map" title="Global markets map" src={[q, wb, fred, pol, imf, ev, hz, ship]} span="c8 mappanel" hasData>
      <div className="mapwrap">
        <div ref={box} className="mapcanvas" />
        {mapErr && <div className="maperr" role="status">{mapErr}</div>}
        <div className="maplayers">
          <button className="btn" onClick={() => switchBase('sat')} aria-pressed={base === 'sat'}>Satellite</button>
          <button className="btn" onClick={() => switchBase('dark')} aria-pressed={base === 'dark'}>Streets</button>
          <button className="btn" onClick={() => setShowShip((v) => !v)} aria-pressed={showShip} title="Shipping lanes and chokepoint traffic (IMF PortWatch)">Shipping</button>
          <button className="btn" onClick={() => { const on = !(showEv || showHz); setShowEv(on); setShowHz(on); }} aria-pressed={showEv || showHz} title="Market-moving events: war, unrest, sanctions (GDELT, 24h) and natural hazards (USGS, GDACS, NASA)">Events</button>
        </div>
        {(showEv || showHz) && <div className="evlegend" role="group" aria-label="Event types">
          {EVENT_CATS.map((c) => (
            <button key={c.id} className={showEv && evCats.has(c.id) ? 'on' : ''} title={c.hint} aria-pressed={evCats.has(c.id)}
              onClick={() => { setShowEv(true); setEvCats((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; }); }}>
              <i style={{ background: c.color }} />{c.label}{ev.data ? <span>{ev.data.byCat[c.id].toLocaleString('en-US')}</span> : null}
            </button>
          ))}
          <button className={showHz ? 'on' : ''} aria-pressed={showHz} title="Significant earthquakes and tsunami flags (USGS), Orange/Red cyclone, flood, volcano and drought alerts (GDACS), large wildfires (NASA EONET), last 14 days" onClick={() => setShowHz((v) => !v)}>
            <i style={{ background: HAZARD_COLOR }} />Natural hazards{hz.data ? <span>{hz.data.items.length}</span> : null}
          </button>
          <small>GDELT 24h · hazards 14d</small>
        </div>}
        <div className="maplegend"><span>Index today</span><span style={{ width: 90, height: 6, borderRadius: 3, background: 'linear-gradient(90deg,#cd3a34,#2a2a2a,#349652)', display: 'inline-block' }} /><span>−2% … +2%</span></div>
        {sel && (
          <aside className="mapside" aria-live="polite">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <h3>{sel.name}</h3>
              <button className="link" style={{ color: 'var(--faint)', textDecoration: 'none' }} onClick={() => setSel(null)} aria-label="Close">×</button>
            </div>
            <table className="t" style={{ marginTop: 6 }}>
              <tbody>
                {sel.index && <tr><td>{sel.index[1]}</td><td>{iq ? price(iq.price) : '—'}</td><td>{iq && isStaleQuote(iq) ? <small className="faint">as of {new Date(iq.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small> : <Chg v={iq?.changePct} />}</td></tr>}
                {sel.fx && <tr><td>{sel.fx[1]}</td><td>{fq ? price(fq.price) : '—'}</td><td><Chg v={fq?.changePct} /></td></tr>}
                {pr && <tr title="Central bank policy rate (BIS). Change is versus a year earlier."><td>Policy rate<br /><small className="faint">{pr.area === 'XM' ? 'ECB' : 'central bank'}{pr.changed ? ' · moved ' + new Date(pr.changed + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}</small></td><td>{pr.v.toFixed(2)}%</td><td>{pr.y1 != null ? <Chg v={(pr.v - pr.y1) * 100} dp={0} suffix="bp" invert /> : ''}</td></tr>}
                {sel.bond && <tr title="Monthly average long-term (10-year) government bond yield, OECD via FRED. Change is versus a year earlier."><td>10Y gov't yield<br /><small className="faint">{bond ? new Date(bond.d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'OECD'}</small></td><td>{bond ? bond.v.toFixed(2) + '%' : '—'}</td><td>{bond && bondPrev ? <Chg v={(bond.v - bondPrev.v) * 100} dp={0} suffix="bp" invert /> : ''}</td></tr>}
              </tbody>
            </table>
            <CountryEvents d={ev.data} fips={FIPS[sel.iso3]} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 4px' }}>
              <span className="faint" style={{ fontSize: 12 }}>Fundamentals</span>
              <Tabs small value={fundTab} onChange={setFundTab} options={[['imf', 'IMF outlook'], ['wb', 'World Bank']]} />
            </div>
            {fundTab === 'imf' ? <ImfCard d={imf.data} iso3={sel.iso3} err={imf.status === 'error' ? imf.error ?? 'unavailable' : undefined} /> : sel.iso3 === 'TWN' ? <p className="dim" style={{ fontSize: 11 }}>The World Bank doesn't publish data for Taiwan.</p> : (<>
              <table className="t"><tbody>
                {WB_INDICATORS.map((ind) => {
                  const v = fund?.[ind.id];
                  return <tr key={ind.id}><td>{ind.label}</td><td>{v ? (ind.unit === 'USD' ? '$' + big(v.v) : num(v.v, 1) + (ind.unit.startsWith('%') ? '%' : '')) : '—'}</td><td className="faint">{v?.year ?? ''}</td></tr>;
                })}
              </tbody></table>
              <p className="faint" style={{ fontSize: 10.5, marginTop: 6 }}>Annual figures; the year shown is the latest available.</p>
            </>)}
          </aside>
        )}
      </div>
    </Panel>
  );
}

/** IMF World Economic Outlook for one country: last year, this year and next (IMF estimates/projections). */
function ImfCard({ d, iso3, err }: { d?: ImfData; iso3: string; err?: string }) {
  if (!d) return <p className="dim" style={{ fontSize: 11 }}>{err ? `IMF outlook unavailable right now (${err}).` : 'Loading the IMF outlook…'}</p>;
  const c = d.data[iso3];
  if (!c) return <p className="dim" style={{ fontSize: 11 }}>The IMF doesn't publish an outlook for this economy.</p>;
  const now = new Date().getFullYear(), ys = [now - 1, now, now + 1].map(String);
  const fmt = (v: number | undefined, unit: string) => v == null ? '—' : unit === 'USD bn' ? '$' + big(v * 1e9) : unit === 'USD' ? '$' + big(v) : num(v, 1) + '%';
  return <>
    <table className="t">
      <thead><tr><th></th>{ys.map((y) => <th key={y}>{y}{Number(y) >= now ? 'f' : ''}</th>)}</tr></thead>
      <tbody>{IMF_INDICATORS.filter((i) => i.id !== 'NGDPDPC').map((ind) => c[ind.id] && (
        <tr key={ind.id}><td>{ind.label}</td>{ys.map((y) => <td key={y}>{fmt(c[ind.id]?.[y], ind.unit)}</td>)}</tr>
      ))}</tbody>
    </table>
    <p className="faint" style={{ fontSize: 10.5, marginTop: 6 }}>{d.edition}{d.saved ? ` (copy saved from imf.org ${d.saved})` : ''}. f = IMF forecast; earlier years can still be estimates.</p>
  </>;
}

/** Last-24h events for the selected country (GDELT), with the most-covered few. */
function CountryEvents({ d, fips }: { d?: EventsData; fips?: string }) {
  if (!d || !fips) return null;
  const c = d.byCountry[fips];
  return (
    <div className="cev">
      <div className="cev-h"><span className="faint" style={{ fontSize: 12 }}>Events · 24h</span>
        <span className="cev-n">{EVENT_CATS.map((k) => <span key={k.id} title={k.label}><i style={{ background: k.color }} />{(c?.byCat[k.id] ?? 0).toLocaleString('en-US')}</span>)}</span>
      </div>
      {c?.top.length ? <ul className="cev-l">{c.top.slice(0, 3).map((e, i) => (
        <li key={i}><i style={{ background: EVENT_CATS.find((k) => k.id === e.cat)?.color }} /><span><b>{e.label}</b>{e.a1 || e.a2 ? ` · ${[e.a1, e.a2].filter(Boolean).map(tidyActor).join(' → ')}` : ''}<small>{e.place} · {e.m} mentions · <a href={e.url} target="_blank" rel="noopener noreferrer">{host(e.url)}</a></small></span></li>
      ))}</ul> : <p className="faint" style={{ fontSize: 11.5 }}>No widely reported conflict, unrest or sanctions events in the last 24 hours.</p>}
    </div>
  );
}
export const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
export const tidyActor = (a: string) => a.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
