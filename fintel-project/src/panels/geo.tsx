import { useMemo, useState } from 'react';
import { EVENT_CATS, EVENTS, FIPS, vsNormal, type EventCat } from '@/data/events';
import { pickWindow, useEventWindow } from '@/ui/evwindow';
import { useSource } from '@/data/store';
import { Chg, Panel, Spark, Tabs, useNow, Big } from '@/ui/kit';
import { ago, big, dateLabel, isNum } from '@/lib/format';
import { HAZARDS, HAZARD_COLOR, HAZARD_LABEL } from '@/data/hazards';
import { SHIPPING, weekAvg, yearBefore } from '@/data/shipping';
import { CARGO, CARGO_HUBS, chokeRisk, PORTS, portWeek } from '@/data/trade';
import { useQuotes } from '@/data/yahoo';
import { T } from '@/ui/theme';
import { host, tidyActor } from '@/map/WorldMap';

// Market-moving events: war and armed conflict, strikes and unrest, sanctions (GDELT, last 24 hours, widely
// reported only) plus natural hazards with an impact alert (USGS, GDACS, NASA EONET, last 14 days).
const ISO_BY_FIPS = Object.fromEntries(Object.entries(FIPS).map(([iso, f]) => [f, iso]));
type Tab = 'all' | EventCat | 'hazard';
const focus = (lat: number, lng: number, iso3?: string) => dispatchEvent(new CustomEvent('fintel:map-focus', { detail: { lat, lng, iso3 } }));

export function WorldEvents() {
  const s = useSource(EVENTS);
  const hz = useSource(HAZARDS);
  const now = useNow();
  const [cat, setCat] = useState<Tab>('all');
  const [win, setWin] = useEventWindow();
  const d = pickWindow(s.data, win);
  const trend = s.data?.trend ?? {};
  const hazards = hz.data?.items ?? [];
  const severe = hazards.filter((h) => h.level === 'red' || h.level === 'orange');
  const rows = (d?.top ?? []).filter((e) => cat === 'all' || e.cat === cat);
  const hzRows = cat === 'hazard' ? hazards : cat === 'all' ? severe : [];
  // countries whose last 24 h runs furthest above their own normal (needs a few days of history)
  const rising = Object.entries(trend).map(([f, t]) => [f, vsNormal(t), t.today] as const).filter(([f, x, n]) => ISO_BY_FIPS[f] && x != null && x >= 1.3 && n >= 5).sort((a, b) => b[1]! - a[1]!).slice(0, 3);
  const hot = d ? Object.entries(d.byCountry).filter(([f]) => ISO_BY_FIPS[f]).sort((a, b) => b[1].byCat.conflict - a[1].byCat.conflict).slice(0, 3) : [];
  const name = (() => { let dn: Intl.DisplayNames | undefined; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* old browser */ } return (iso3: string) => { const c = iso3 ? FIPS[iso3] : ''; return c ? (dn?.of(iso2(iso3)) ?? iso3) : iso3; }; })();
  return (
    <Panel id="p-events" title="Market-moving events" src={[s, hz]} span="c8" hasData={!!d || !!hz.data}
      right={<div className="tabrow"><Tabs small value={win} onChange={setWin} options={[['24h', '24h'], ['7d', '7d']]} /><Tabs small value={cat} onChange={setCat} options={[['all', 'All'], ...EVENT_CATS.map((c) => [c.id, c.label.split(' ')[0]] as [EventCat, string]), ['hazard', 'Hazards']]} /></div>}
      note="War, strikes, sanctions: machine-coded from news by the GDELT Project (last 24 hours or 7 days); repeated reports of one story are grouped. “× normal” compares a country’s last 24 hours with its daily average over the days before. Open the source before relying on one. Hazards: USGS (significant or M6+ quakes, tsunami flags), GDACS Orange/Red alerts (cyclones, floods, volcanoes, droughts) and NASA EONET wildfires over 1,000 acres. Click a row to see it on the map.">
      <div className="kpis">
        {EVENT_CATS.map((c) => <div className="kpi" key={c.id}><span><i className="evdot" style={{ background: c.color }} />{c.label}</span><b><Big>{d ? d.byCat[c.id].toLocaleString('en-US') : '—'}</Big></b><small>events · {win}</small></div>)}
        <div className="kpi"><span><i className="evdot" style={{ background: HAZARD_COLOR }} />Natural hazards</span><b><Big>{hz.data ? String(hazards.length) : '—'}</Big></b><small>{hz.data ? `${severe.filter((h) => h.level === 'red').length} red · ${severe.filter((h) => h.level === 'orange').length} orange · 14d` : hz.error ?? ''}</small></div>
        {rising.length
          ? <div className="kpi"><span>Above normal</span><b style={{ fontSize: 15, lineHeight: 1.5 }}>{rising.map(([f, x]) => `${name(ISO_BY_FIPS[f])} ${x!.toFixed(1)}×`).join(' · ')}</b><small>last 24 h vs daily average</small></div>
          : <div className="kpi"><span>Most conflict</span><b style={{ fontSize: 15, lineHeight: 1.5 }}>{hot.map(([f, v]) => `${name(ISO_BY_FIPS[f])} ${v.byCat.conflict}`).join(' · ') || '—'}</b><small>tracked countries · {win}</small></div>}
      </div>
      <ul className="feed evfeed">
        {hzRows.map((h) => (
          <li key={h.id} className="click" onClick={() => focus(h.lat, h.lng, h.iso3)}>
            <span className="meta">{now - h.t > 14 * 864e5 ? 'since ' + new Date(h.t).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : ago(h.t, now)}</span>
            <i className={'evdot hz' + (h.level ? ' ' + h.level : '')} style={{ background: HAZARD_COLOR }} />
            <span className="ttl">{h.title}<span className="dim"> · {HAZARD_LABEL[h.kind]}{h.level ? ` · ${h.level} alert` : ''}</span>
              <small>{h.detail} · <a href={h.url} target="_blank" rel="noopener noreferrer" onClick={(x) => x.stopPropagation()}>{h.src} ↗</a></small></span>
          </li>
        ))}
        {cat !== 'hazard' && rows.map((e, i) => (
          <li key={i} className="click" onClick={() => focus(e.lat, e.lng, ISO_BY_FIPS[e.fips])}>
            <span className="meta">{ago(e.t, now)}</span>
            <i className="evdot" style={{ background: EVENT_CATS.find((c) => c.id === e.cat)?.color }} />
            <span className="ttl">{e.label}{e.a1 || e.a2 ? <span className="dim"> · {[e.a1, e.a2].filter(Boolean).map(tidyActor).join(' → ')}</span> : null}
              <small>{e.place} · {e.n && e.n > 1 ? `${e.n} reports` : `${e.m} mentions`} · <a href={e.url} target="_blank" rel="noopener noreferrer" onClick={(x) => x.stopPropagation()}>{host(e.url)} ↗</a></small></span>
          </li>
        ))}
        {(cat === 'hazard' ? hz.data && !hzRows.length : d && !rows.length && !hzRows.length) && <li className="dim">Nothing of this type in the window.</li>}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- shipping chokepoints (IMF PortWatch)
type ShipTab = 'choke' | 'ports' | 'risk';
export function Shipping() {
  const s = useSource(SHIPPING);
  const pw = useSource(PORTS);
  const ev = useSource(EVENTS);
  const hz = useSource(HAZARDS);
  const oil = useQuotes(['BZ=F', 'CL=F']);
  const [tab, setTab] = useState<ShipTab>('choke');
  const d = s.data;
  const risk = useMemo(() => (d ? chokeRisk(d.points, (ev.data?.week ?? ev.data)?.points ?? [], hz.data?.items ?? []) : []), [d, ev.data, hz.data]);
  const riskBy = new Map(risk.map((r) => [r.id, r]));
  const hot = (id: string) => { const r = riskBy.get(id); return !!r && (r.conflict >= 3 || r.hazards.length > 0); };
  const rows = (d?.points ?? []).map((p) => {
    const ser = d!.daily[p.id], now = weekAvg(ser, d!.last), prev = weekAvg(ser, yearBefore(d!.last)), tank = weekAvg(ser, d!.last, 'tanker');
    return { p, now, yoy: now != null && prev ? (now / prev - 1) * 100 : null, tank: now && tank != null ? (tank / now) * 100 : null, spark: (ser ?? []).slice(-120).map((x) => x.total) };
  }).filter((r) => r.now != null).sort((a, b) => b.now! - a.now!);
  const pd = pw.data;
  const ports = (pd?.ports ?? []).map((p) => {
    const ser = pd!.daily[p.id], now = portWeek(ser, pd!.last), prev = portWeek(ser, yearBefore(pd!.last));
    const trade = (portWeek(ser, pd!.last, 'imp') ?? 0) + (portWeek(ser, pd!.last, 'exp') ?? 0);
    return { p, now, yoy: now != null && prev ? (now / prev - 1) * 100 : null, trade, spark: (ser ?? []).filter((x) => x.d > yearBefore(pd!.last)).map((x) => x.calls) };
  }).filter((r) => r.now != null).sort((a, b) => b.now! - a.now!);
  const atRisk = rows.filter((r) => hot(r.p.id))
    .sort((a, b) => { const x = riskBy.get(a.p.id)!, y = riskBy.get(b.p.id)!; return (y.conflict + y.hazards.length * 20) - (x.conflict + x.hazards.length * 20); });
  const brent = oil.data?.['BZ=F'], wti = oil.data?.['CL=F'];
  const src = tab === 'ports' ? pw : tab === 'risk' ? [s, ev, hz, oil] : s;
  return (
    <Panel id="p-shipping" title="Shipping" src={src} span="c4" hasData={tab === 'ports' ? !!pd : !!d}
      right={<Tabs small value={tab} onChange={setTab} options={[['choke', 'Chokepoints'], ['ports', 'Ports'], ['risk', 'Risk']]} />}
      note={tab === 'ports'
        ? `Port calls per day at the ${pd?.ports.length ?? 30} busiest ports, averaged over the 7 days to ${pd ? dateLabel(pd.last) : 'the latest report'}, with estimated cargo handled (imports + exports, metric tons), from satellite AIS signals (IMF PortWatch, updated weekly). YoY compares the same week a year earlier.`
        : tab === 'risk'
          ? 'Chokepoints with at least 3 reports of fighting (assaults, armed clashes, mass violence) within 250 km in the last 7 days, or an orange/red natural-hazard alert nearby; unrest and sanctions events nearby are listed too. Events come from GDELT (widely reported, located to a city or region; country-wide reports, threats and troop movements are left out); hazards from USGS, GDACS and NASA EONET. Shown with the chokepoint’s traffic and the oil price. Proximity is not proof that shipping is affected.'
          : `Ships passing each chokepoint per day, averaged over the 7 days to ${d ? dateLabel(d.last) : 'the latest report'}, from satellite AIS signals (IMF PortWatch, updated weekly). YoY compares the same week a year earlier. A dot marks fighting or a hazard nearby (see Risk). Click a row to see it on the map.`}>
      {tab === 'choke' && <table className="t">
        <thead><tr><th>Chokepoint</th><th>Ships/day</th><th>YoY</th><th className="hs">Tankers</th><th>120d</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.p.id} className="click" onClick={() => focus(r.p.lat, r.p.lng)} title={r.p.topIndustries.length ? 'Main cargo: ' + r.p.topIndustries.join(', ') : ''}>
              <td>{r.p.name.replace(/ Strait$/, '')}{hot(r.p.id) && <i className="riskdot" title="Conflict or hazard nearby" />}</td>
              <td>{r.now!.toFixed(0)}</td>
              <td>{isNum(r.yoy) ? <Chg v={r.yoy} dp={0} /> : '—'}</td>
              <td className="hs dim">{isNum(r.tank) ? r.tank.toFixed(0) + '%' : '—'}</td>
              <td><Spark data={r.spark} w={56} h={16} color={T.accent} fill={false} /></td>
            </tr>
          ))}
        </tbody>
      </table>}
      {tab === 'ports' && <table className="t">
        <thead><tr><th>Port</th><th>Calls/day</th><th>YoY</th><th className="hs">Cargo t/day</th><th>90d</th></tr></thead>
        <tbody>{ports.map((r) => (
          <tr key={r.p.id} className="click" onClick={() => focus(r.p.lat, r.p.lng)} title={`${r.p.name}, ${r.p.country}`}>
            <td>{r.p.name.replace(/\s*\(.*\)$/, '')} <small className="faint">{iso2(r.p.iso3)}</small></td>
            <td>{r.now!.toFixed(0)}</td>
            <td>{isNum(r.yoy) ? <Chg v={r.yoy} dp={0} /> : '—'}</td>
            <td className="hs dim">{r.trade ? big(r.trade, 1) : '—'}</td>
            <td><Spark data={r.spark} w={56} h={16} color={T.accent} fill={false} /></td>
          </tr>))}</tbody>
      </table>}
      {tab === 'risk' && <>
        <div className="kpis">
          <div className="kpi"><span>Brent</span><b><Big>{brent ? '$' + brent.price.toFixed(2) : '—'}</Big></b><small><Chg v={brent?.changePct} /> today</small></div>
          <div className="kpi"><span>WTI</span><b><Big>{wti ? '$' + wti.price.toFixed(2) : '—'}</Big></b><small><Chg v={wti?.changePct} /> today</small></div>
          <div className="kpi"><span>Chokepoints flagged</span><b><Big>{atRisk.length}</Big></b><small>of {rows.length}</small></div>
        </div>
        {atRisk.length ? <ul className="feed" style={{ marginTop: 8 }}>{atRisk.map((r) => { const k = riskBy.get(r.p.id)!; return (
          <li key={r.p.id} className="click" onClick={() => focus(r.p.lat, r.p.lng)}>
            <span className="ttl"><b>{r.p.name.replace(/ Strait$/, '')}</b>
              <small>{[k.conflict && `${k.conflict} fighting reports${k.places.length ? ' (' + k.places.join(', ') + ')' : ''}`, k.unrest && `${k.unrest} unrest`, k.sanctions && `${k.sanctions} sanctions`, ...k.hazards.map((h) => `${HAZARD_LABEL[h.kind]}: ${h.title}`)].filter(Boolean).join(' · ')}</small></span>
            <span className="mono" style={{ textAlign: 'right' }}>{r.now!.toFixed(0)}/day<br /><small>{isNum(r.yoy) ? <Chg v={r.yoy} dp={0} /> : ''}</small></span>
          </li>); })}</ul> : <div className="empty">{ev.data && hz.data ? 'Nothing flagged near a chokepoint this week.' : 'Loading events…'}</div>}
      </>}
    </Panel>
  );
}

// ISO3 → ISO2 for display names (only the tracked countries are named here)
const ISO2: Record<string, string> = { USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR', CHL: 'CL', COL: 'CO', PER: 'PE', GBR: 'GB', DEU: 'DE', FRA: 'FR', ITA: 'IT', ESP: 'ES', NLD: 'NL', CHE: 'CH', SWE: 'SE', DNK: 'DK', NOR: 'NO', FIN: 'FI', IRL: 'IE', PRT: 'PT', GRC: 'GR', AUT: 'AT', BEL: 'BE', POL: 'PL', CZE: 'CZ', HUN: 'HU', TUR: 'TR', ISR: 'IL', SAU: 'SA', ARE: 'AE', QAT: 'QA', KWT: 'KW', EGY: 'EG', MAR: 'MA', NGA: 'NG', GHA: 'GH', KEN: 'KE', ZAF: 'ZA', RUS: 'RU', IND: 'IN', PAK: 'PK', BGD: 'BD', CHN: 'CN', HKG: 'HK', JPN: 'JP', KOR: 'KR', TWN: 'TW', SGP: 'SG', IDN: 'ID', THA: 'TH', MYS: 'MY', VNM: 'VN', PHL: 'PH', AUS: 'AU', NZL: 'NZ' };
const iso2 = (iso3: string) => ISO2[iso3] ?? iso3;

// ---------------------------------------------------------------- air cargo
export function AirCargo() {
  const c = useSource(CARGO);
  const now = useNow();
  const d = c.data;
  const hubs = CARGO_HUBS.map((h) => ({ h, x: d?.hubs[h.code] })).filter((r) => r.x).sort((a, b) => (b.x!.air + b.x!.ground) - (a.x!.air + a.x!.ground));
  const ops = Object.entries((d?.planes ?? []).reduce<Record<string, number>>((m, p) => ((m[p.op] = (m[p.op] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  return (
    <Panel id="p-aircargo" title="Air cargo" src={c} span="c4"
      note="Aircraft flying for all-cargo airlines (FedEx, UPS, Atlas, Cargolux, DHL, Kalitta, Cargojet and others), from the adsb.lol community ADS-B feed: every freighter-type aircraft its receivers see worldwide, plus any aircraft within about 150 nautical miles of the 16 hubs; hub rows count what is within that distance. Freighters of passenger airlines (Emirates SkyCargo, Cathay, Qatar…) fly under the airline’s passenger callsign, so they can’t be told apart and aren’t counted, and much air cargo rides in passenger planes’ holds. Coverage depends on volunteer receivers: thin over oceans and mainland China, and the count swings with the time of day (FedEx and UPS fly mostly at night). Turn on Cargo on the map to see them.">
      {d && <>
        <div className="kpis">
          <div className="kpi"><span>Cargo aircraft</span><b><Big>{String(d.planes.length)}</Big></b><small>{d.worldwide ? 'seen worldwide' : `near ${hubs.length} hubs`}</small></div>
          <div className="kpi"><span>Airborne</span><b><Big>{String(d.planes.filter((p) => !p.ground).length)}</Big></b><small>{d.planes.filter((p) => p.ground).length} on the ground</small></div>
          <div className="kpi"><span>Snapshot</span><b style={{ fontSize: 15 }}>{ago(d.at, now)}</b><small>{new Date(d.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</small></div>
        </div>
        <table className="t" style={{ marginTop: 8 }}>
          <thead><tr><th>Hub</th><th>Airborne</th><th>Ground</th></tr></thead>
          <tbody>{hubs.map(({ h, x }) => <tr key={h.code} className="click" onClick={() => focus(h.lat, h.lng)}><td><b className="mono">{h.code}</b> <small className="dim">{h.name}</small></td><td>{x!.ok ? x!.air : '—'}</td><td className="dim">{x!.ok ? x!.ground : 'no answer'}</td></tr>)}</tbody>
        </table>
        {ops.length > 0 && <p className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>{ops.slice(0, 8).map(([o, n]) => `${o} ${n}`).join(' · ')}</p>}
      </>}
    </Panel>
  );
}
