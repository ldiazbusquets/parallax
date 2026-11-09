import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { refreshAll, useAllSources } from '@/data/store';
import { KEY_INFO, getKey, keySource, setKey, type KeyName } from '@/lib/keys';
import { ago } from '@/lib/format';
import { STATIC } from '@/lib/env';
import { Dot, useNow } from '@/ui/kit';
import { Commodities, Currencies, Heatmap, History, Indices, Sectors, Tape, Volatility, Watchlist } from '@/panels/markets';
import { Auctions, CentralBanks, Credit, Economy, YieldCurve, GlobalRates, WorldOutlook, EconomicCalendar, GovYields } from '@/panels/macro';
import { Screener, ShortInterest } from '@/panels/equity';
import { Calendar, Crypto, Filings, News, Positioning } from '@/panels/flows';
import { Brief } from '@/panels/brief';
import { Alerts, Toasts } from '@/panels/alerts';
import { LinkView } from '@/panels/network';
import { CompanyPage, openCompany, useCompanyRoute } from '@/panels/company';
import { WorldMap } from '@/map/WorldMap';
import { WorldEvents, Shipping } from '@/panels/geo';
import { CommandBar } from '@/ui/Command';
import { Footer } from '@/ui/Footer';
import { useInstall } from '@/ui/install';
import { Slot, useWorkspaces, WORKSPACES, type Span } from '@/ui/layout';

// Exchange hours (local time) for the clocks. Weekends closed; holidays not modelled.
// The usual trading-desk set: the three big hubs (New York, London, Tokyo) plus Frankfurt, Hong Kong and
// Sydney, which opens the global trading day. Regular cash-session hours (lunch breaks ignored).
const CLOCKS: { label: string; city: string; tz: string; open: [number, number]; close: [number, number] }[] = [
  { label: 'NYC', city: 'New York (NYSE)', tz: 'America/New_York', open: [9, 30], close: [16, 0] },
  { label: 'LDN', city: 'London (LSE)', tz: 'Europe/London', open: [8, 0], close: [16, 30] },
  { label: 'FRA', city: 'Frankfurt (Xetra)', tz: 'Europe/Berlin', open: [9, 0], close: [17, 30] },
  { label: 'TYO', city: 'Tokyo (TSE)', tz: 'Asia/Tokyo', open: [9, 0], close: [15, 30] },
  { label: 'HKG', city: 'Hong Kong (HKEX)', tz: 'Asia/Hong_Kong', open: [9, 30], close: [16, 0] },
  { label: 'SYD', city: 'Sydney (ASX)', tz: 'Australia/Sydney', open: [10, 0], close: [16, 0] },
];

function Clocks() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="clocks">
      {CLOCKS.map((c) => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(now).map((p) => [p.type, p.value]));
        const mins = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
        const open = !['Sat', 'Sun'].includes(parts.weekday) && mins >= c.open[0] * 60 + c.open[1] && mins < c.close[0] * 60 + c.close[1];
        return <span key={c.label} className={open ? 'open' : ''} title={`${c.city}: ${open ? 'open (regular session)' : 'closed'}`}>{c.label}<b>{parts.hour}:{parts.minute}</b></span>;
      })}
    </div>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const [vals, setVals] = useState<Record<KeyName, string>>({ finnhub: getKey('finnhub'), groq: getKey('groq') });
  const all = useAllSources();
  const now = useNow();
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal-in" onClick={(e) => e.stopPropagation()}>
        <h2>OPTIONAL API KEYS</h2>
        <p className="dim" style={{ marginBottom: 14, fontSize: 12 }}>Everything else works without keys. Keys are saved only in this browser and sent only to their own service.</p>
        {(Object.keys(KEY_INFO) as KeyName[]).map((k) => (
          <div className="field" key={k}>
            <label htmlFor={'k-' + k}>{KEY_INFO[k].label} <small className="faint">({keySource(k) === 'env' ? 'from .env' : keySource(k) === 'browser' ? 'saved' : 'not set'})</small></label>
            <input id={'k-' + k} className="in mono" type="password" autoComplete="off" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} placeholder="paste key" />
            <small>{KEY_INFO[k].unlocks}. Free key at <a href={KEY_INFO[k].url} target="_blank" rel="noreferrer" className="link">{KEY_INFO[k].url.replace('https://', '')}</a></small>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 18 }}>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn pri" onClick={() => { (Object.keys(vals) as KeyName[]).forEach((k) => setKey(k, vals[k])); onClose(); }}>Save keys</button>
        </div>
        <h2>DATA SOURCES</h2>
        {STATIC && <p className="dim" style={{ fontSize: 12, marginBottom: 8 }}>Website mode: Yahoo, FRED, SEC and news come from a snapshot a GitHub job refreshes about every 15 minutes (company data daily). Treasury, CFTC, crypto, World Bank, Finnhub and Groq load live.</p>}
        <ul className="srclist">
          {all.sort((a, b) => a.label.localeCompare(b.label)).map((s) => (
            <li key={s.id}><Dot status={s.status} /><span>{s.label} <span className="faint">· {s.provider}</span></span><span className="mono dim" style={{ fontSize: 11 }}>{s.updated ? ago(s.updated, now) : s.status}</span>{s.error && <small>{s.error}</small>}</li>
          ))}
        </ul>
        <button className="btn" style={{ marginTop: 12 }} onClick={refreshAll}>Refresh all now</button>
      </div>
    </div>
  );
}

function Health({ onClick }: { onClick: () => void }) {
  const all = useAllSources();
  const live = all.filter((s) => s.status === 'live').length;
  const bad = all.filter((s) => s.status === 'error' || s.status === 'stale').length;
  const keys = all.filter((s) => s.status === 'needs-key').length;
  return (
    <button className="health" onClick={onClick} title="Data sources and settings">
      <Dot status={bad ? 'stale' : live ? 'live' : 'loading'} />
      <span className="h-txt">{live}/{all.length} live{bad ? ` · ${bad} issue${bad > 1 ? 's' : ''}` : ''}{keys ? ` · ${keys} need key` : ''}</span>
      <span aria-hidden="true" style={{ marginLeft: 4 }}>⚙</span>
    </button>
  );
}

export default function App() {
  const [canInstall, install] = useInstall();
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [spin, setSpin] = useState(false);
  const [sel, setSel] = useState('PLTR');
  const [company, closeCompany] = useCompanyRoute();
  useEffect(() => { const o = () => setSettings(true); addEventListener('fintel:settings', o); return () => removeEventListener('fintel:settings', o); }, []);
  const chartIt = useCallback((s: string) => { setSel(s); }, []);

  const PANELS: Record<string, { id: string; label: string; span: Span; el: ReactNode }> = {
    map: { id: 'p-map', label: 'World map', span: 'c8', el: <WorldMap /> },
    indices: { id: 'p-indices', label: 'Indices', span: 'c4', el: <Indices /> },
    sectors: { id: 'p-sectors', label: 'Sectors', span: 'c4', el: <Sectors /> },
    vol: { id: 'p-vol', label: 'Volatility', span: 'c4', el: <Volatility /> },
    fx: { id: 'p-fx', label: 'Currencies', span: 'c4', el: <Currencies /> },
    heatmap: { id: 'p-heatmap', label: 'Heatmap', span: 'c8', el: <Heatmap onPick={openCompany} /> },
    cmdty: { id: 'p-cmdty', label: 'Commodities', span: 'c4', el: <Commodities /> },
    watch: { id: 'p-watch', label: 'Watchlist', span: 'c8', el: <Watchlist sel={sel} setSel={setSel} /> },
    alerts: { id: 'p-alerts', label: 'Alerts', span: 'c4', el: <Alerts /> },
    crypto: { id: 'p-crypto', label: 'Crypto', span: 'c4', el: <Crypto /> },
    curve: { id: 'p-curve', label: 'Yield curve', span: 'c4', el: <YieldCurve /> },
    cb: { id: 'p-cb', label: 'Central banks', span: 'c4', el: <CentralBanks /> },
    events: { id: 'p-events', label: 'World events', span: 'c8', el: <WorldEvents /> },
    weo: { id: 'p-weo', label: 'World economic outlook', span: 'c12', el: <WorldOutlook /> },
    rates: { id: 'p-rates', label: 'Global policy rates', span: 'c4', el: <GlobalRates /> },
    credit: { id: 'p-credit', label: 'Credit', span: 'c4', el: <Credit /> },
    eco: { id: 'p-eco', label: 'Economy', span: 'c8', el: <Economy /> },
    cot: { id: 'p-cot', label: 'Positioning', span: 'c8', el: <Positioning /> },
    auctions: { id: 'p-auctions', label: 'Auctions', span: 'c4', el: <Auctions /> },
    link: { id: 'p-link', label: 'Link analysis', span: 'c12', el: <LinkView onOpen={openCompany} /> },
    news: { id: 'p-news', label: 'Headlines', span: 'c6', el: <News /> },
    filings: { id: 'p-filings', label: 'SEC filings', span: 'c3', el: <Filings /> },
    cal: { id: 'p-cal', label: 'Earnings & IPOs', span: 'c3', el: <Calendar /> },
    hist: { id: 'p-hist', label: 'S&P history', span: 'c6', el: <History /> },
    brief: { id: 'p-brief', label: 'AI brief', span: 'c6', el: <Brief /> },
    ecocal: { id: 'p-ecocal', label: 'Economic calendar', span: 'c4', el: <EconomicCalendar /> },
    govies: { id: 'p-govies', label: 'Government bonds', span: 'c4', el: <GovYields /> },
    screener: { id: 'p-screener', label: 'Stock screener', span: 'c12', el: <Screener /> },
    shipping: { id: 'p-shipping', label: 'Shipping chokepoints', span: 'c4', el: <Shipping /> },
    shorts: { id: 'p-shorts', label: 'Short interest', span: 'c4', el: <ShortInterest /> },
  };
  const L = useWorkspaces(Object.keys(PANELS));
  const hidden = Object.keys(PANELS).filter((k) => !L.items.some((i) => i.key === k));

  // A command that targets a hidden panel adds it back, then scrolls to it.
  useEffect(() => {
    const f = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const key = Object.keys(PANELS).find((k) => PANELS[k].id === id);
      if (!key) return;
      // go to the workspace that has this panel, or add it to the current one
      const home = L.home(key);
      if (home) L.go(home); else L.show(key, PANELS[key].span);
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    };
    addEventListener('fintel:need-panel', f); return () => removeEventListener('fintel:need-panel', f);
  });

  return (
    <>
      <header className="top">
        <div className="bar">
          <button className="brand" title="Home: back to Overview and refresh all data" aria-label="Parallax home: go to Overview and refresh data"
            onClick={() => { if (company) closeCompany(); L.go('overview'); scrollTo({ top: 0, behavior: 'smooth' }); refreshAll(); setSpin(true); setTimeout(() => setSpin(false), 900); }}><svg viewBox="0 0 24 24" aria-hidden="true" className={spin ? 'spin' : ''}><rect x="3" y="13" width="4" height="8" rx="2" fill="#e8e8e8" opacity=".45" /><rect x="10" y="8" width="4" height="13" rx="2" fill="#e8e8e8" opacity=".7" /><rect x="17" y="3" width="4" height="18" rx="2" fill="#e8e8e8" /></svg><span>Parallax</span><em>Terminal</em></button>
          <nav className="ws-tabs" aria-label="Workspaces">{WORKSPACES.map((w) => <button key={w.id} className={w.id === L.ws.id ? 'on' : ''} aria-current={w.id === L.ws.id ? 'page' : undefined} onClick={() => { L.go(w.id); scrollTo({ top: 0 }); }}>{w.name}</button>)}</nav>
          <div className="sp" />
          <CommandBar onTicker={chartIt} onCompany={openCompany} />
          {L.customised && editing && <button className="btn" onClick={L.reset} title="Restore this tab's default layout">Reset tab</button>}
          {canInstall && <button className="btn install-btn" onClick={install} title="Install Parallax as an app on this device">Install app</button>}
          <button className={'btn edit-btn' + (editing ? ' pri' : '')} onClick={() => setEditing((v) => !v)}>{editing ? 'Done' : 'Edit layout'}</button>
          <Health onClick={() => setSettings(true)} />
        </div>
        <div className="tape-row"><Clocks /><Tape /></div>
      </header>
      {editing && (
        <div className="tray">
          <span className="mono dim" style={{ fontSize: 11 }}>Drag panels or use the arrows · {hidden.length ? 'Add back:' : 'All panels shown'}</span>
          {hidden.map((k) => <button key={k} className="btn" onClick={() => L.show(k, PANELS[k].span)}>+ {PANELS[k].label}</button>)}
        </div>
      )}
      <main aria-hidden={!!company}>
        {L.items.map((item) => (
          <Slot key={item.key} item={item} editing={editing} label={PANELS[item.key].label}
            onMove={(d) => L.move(item.key, d)} onResize={(d) => L.resize(item.key, d)} onHide={() => L.hide(item.key)} onDrop={(from) => L.moveTo(from, item.key)}>
            {PANELS[item.key].el}
          </Slot>
        ))}
      </main>
      <Footer onTab={L.go} />
      {company && <CompanyPage key={company} ticker={company} onClose={closeCompany} onTicker={openCompany} />}
      {settings && <Settings onClose={() => setSettings(false)} />}
      <Toasts />
    </>
  );
}
