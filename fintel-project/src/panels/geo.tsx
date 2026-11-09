import { useState } from 'react';
import { EVENT_CATS, EVENTS, FIPS, vsNormal, type EventCat } from '@/data/events';
import { pickWindow, useEventWindow } from '@/ui/evwindow';
import { useSource } from '@/data/store';
import { Chg, Panel, Spark, Tabs, useNow, Big } from '@/ui/kit';
import { ago, dateLabel, isNum } from '@/lib/format';
import { HAZARDS, HAZARD_COLOR, HAZARD_LABEL } from '@/data/hazards';
import { SHIPPING, weekAvg, yearBefore } from '@/data/shipping';
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
export function Shipping() {
  const s = useSource(SHIPPING);
  const [by, setBy] = useState<'now' | 'yoy'>('now');
  const d = s.data;
  const rows = (d?.points ?? []).map((p) => {
    const ser = d!.daily[p.id], now = weekAvg(ser, d!.last), prev = weekAvg(ser, yearBefore(d!.last)), tank = weekAvg(ser, d!.last, 'tanker');
    return { p, now, yoy: now != null && prev ? (now / prev - 1) * 100 : null, tank: now && tank != null ? (tank / now) * 100 : null, spark: (ser ?? []).slice(-120).map((x) => x.total) };
  }).filter((r) => r.now != null).sort((a, b) => (by === 'now' ? b.now! - a.now! : (a.yoy ?? 1e9) - (b.yoy ?? 1e9)));
  return (
    <Panel id="p-shipping" title="Shipping chokepoints" src={s} span="c4"
      right={<Tabs small value={by} onChange={setBy} options={[['now', 'Busiest'], ['yoy', 'Biggest drop']]} />}
      note={`Ships passing each chokepoint per day, averaged over the 7 days to ${d ? dateLabel(d.last) : 'the latest report'}, from satellite AIS signals (IMF PortWatch, updated weekly). YoY compares the same week a year earlier. Click a row to see it on the map.`}>
      <table className="t">
        <thead><tr><th>Chokepoint</th><th>Ships/day</th><th>YoY</th><th className="hs">Tankers</th><th>120d</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.p.id} className="click" onClick={() => focus(r.p.lat, r.p.lng)} title={r.p.topIndustries.length ? 'Main cargo: ' + r.p.topIndustries.join(', ') : ''}>
              <td>{r.p.name.replace(/ Strait$/, '')}</td>
              <td>{r.now!.toFixed(0)}</td>
              <td>{isNum(r.yoy) ? <Chg v={r.yoy} dp={0} /> : '—'}</td>
              <td className="hs dim">{isNum(r.tank) ? r.tank.toFixed(0) + '%' : '—'}</td>
              <td><Spark data={r.spark} w={56} h={16} color={T.accent} fill={false} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

// ISO3 → ISO2 for display names (only the tracked countries are named here)
const ISO2: Record<string, string> = { USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR', CHL: 'CL', COL: 'CO', PER: 'PE', GBR: 'GB', DEU: 'DE', FRA: 'FR', ITA: 'IT', ESP: 'ES', NLD: 'NL', CHE: 'CH', SWE: 'SE', DNK: 'DK', NOR: 'NO', FIN: 'FI', IRL: 'IE', PRT: 'PT', GRC: 'GR', AUT: 'AT', BEL: 'BE', POL: 'PL', CZE: 'CZ', HUN: 'HU', TUR: 'TR', ISR: 'IL', SAU: 'SA', ARE: 'AE', QAT: 'QA', KWT: 'KW', EGY: 'EG', MAR: 'MA', NGA: 'NG', GHA: 'GH', KEN: 'KE', ZAF: 'ZA', RUS: 'RU', IND: 'IN', PAK: 'PK', BGD: 'BD', CHN: 'CN', HKG: 'HK', JPN: 'JP', KOR: 'KR', TWN: 'TW', SGP: 'SG', IDN: 'ID', THA: 'TH', MYS: 'MY', VNM: 'VN', PHL: 'PH', AUS: 'AU', NZL: 'NZ' };
const iso2 = (iso3: string) => ISO2[iso3] ?? iso3;
