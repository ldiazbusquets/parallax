import { useEffect, useMemo, useState } from 'react';
import { CONCEPTS, companySource, NETWORK, type CompanyData, type Metric } from '@/data/company';
import { useSource } from '@/data/store';
import { companyNewsSource } from '@/data/sources';
import { useQuotes } from '@/data/yahoo';
import { ago, big, dateLabel, isNum, num, pct, price } from '@/lib/format';
import { STATIC } from '@/lib/env';
import { Chg, Panel, Tabs, Big, useNow } from '@/ui/kit';
import { PriceChart, useChartStyle } from '@/ui/charts';
import { chartSource, RANGES } from './markets';
import { AnalystRatings, ShortCard } from './equity';
import { SCREENER, TRACKED } from '@/data/equity';

// Bloomberg-style company page: DES (description), GP (chart), FA (financials), insider trades, filings, links.

export function openCompany(t: string) { location.hash = '#/c/' + encodeURIComponent(t.toUpperCase()); }
export function useCompanyRoute(): [string | null, () => void] {
  const read = () => { const m = location.hash.match(/^#\/c\/([^/?]+)/); return m ? decodeURIComponent(m[1]).toUpperCase() : null; };
  const [t, setT] = useState(read);
  useEffect(() => { const f = () => setT(read()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return [t, () => { history.pushState('', document.title, location.pathname + location.search); setT(null); }];
}

const tm = (m?: Metric) => m?.ttm?.val ?? null;
const ratio = (a: number | null, b: number | null) => (isNum(a) && isNum(b) && b !== 0 ? (a / b) * 100 : null);

function Stats({ c, px }: { c: CompanyData; px: number | null }) {
  const M = c.metrics;
  const rev = tm(M.revenue), ni = tm(M.netIncome), ocf = tm(M.ocf), capex = tm(M.capex), eps = tm(M.eps);
  const fcf = isNum(ocf) && isNum(capex) ? ocf - capex : null;
  const mcap = isNum(px) && c.shares ? px * c.shares.val : null;
  const growth = (() => { const a = M.revenue?.annual; return a && a.length >= 2 ? ratio(a[a.length - 1].val - a[a.length - 2].val, a[a.length - 2].val) : null; })();
  const cells: [string, string, string?][] = [
    ['Market cap', mcap ? '$' + big(mcap) : '—', c.shares ? `${big(c.shares.val)} shares` : ''],
    ['P/E (TTM)', isNum(px) && isNum(eps) && eps > 0 ? (px / eps).toFixed(1) + '×' : eps != null && eps <= 0 ? 'n/m' : '—', isNum(eps) ? `EPS $${eps.toFixed(2)}` : ''],
    ['P/S (TTM)', mcap && isNum(rev) && rev > 0 ? (mcap / rev).toFixed(1) + '×' : '—'],
    ['Revenue (TTM)', rev != null ? '$' + big(rev) : '—', growth != null ? `${pct(growth, 1)} last FY` : ''],
    ['Gross margin', ratio(tm(M.grossProfit), rev) != null ? pct(ratio(tm(M.grossProfit), rev), 1, false) : '—'],
    ['Operating margin', ratio(tm(M.operatingIncome), rev) != null ? pct(ratio(tm(M.operatingIncome), rev), 1, false) : '—'],
    ['Net margin', ratio(ni, rev) != null ? pct(ratio(ni, rev), 1, false) : '—'],
    ['Free cash flow (TTM)', fcf != null ? '$' + big(fcf) : '—', fcf != null && rev ? `${pct(ratio(fcf, rev), 1, false)} of revenue` : ''],
    ['Cash', M.cash?.latest ? '$' + big(M.cash.latest.val) : '—', M.cash?.latest ? dateLabel(M.cash.latest.end) : ''],
    ['Long-term debt', M.debt?.latest ? '$' + big(M.debt.latest.val) : '—'],
  ];
  return <div className="kpis">{cells.map(([k, v, s]) => <div className="kpi" key={k}><span>{k}</span><b><Big>{v}</Big></b>{s && <small>{s}</small>}</div>)}</div>;
}

function Financials({ c }: { c: CompanyData }) {
  const [mode, setMode] = useState<'annual' | 'quarters'>('annual');
  const keys = Object.keys(CONCEPTS).filter((k) => c.metrics[k]);
  const ends = useMemo(() => {
    const s = new Set<string>();
    for (const k of keys) for (const p of c.metrics[k][mode]) if (CONCEPTS[k].kind === 'flow' || mode === 'annual') s.add(p.end);
    return [...s].sort().slice(mode === 'annual' ? -5 : -6);
  }, [c, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!keys.length) return <div className="empty">No XBRL financial data filed with the SEC.</div>;
  const fmt = (k: string, v: number) => (k === 'eps' ? v.toFixed(2) : big(v));
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}><Tabs small value={mode} onChange={setMode} options={[['annual', 'Annual'], ['quarters', 'Quarterly']]} /></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead><tr><th>USD</th>{ends.map((e) => <th key={e}>{mode === 'annual' ? 'FY ' + e.slice(0, 4) : e.slice(0, 7)}</th>)}{mode === 'annual' && <th>TTM</th>}</tr></thead>
          <tbody>
            {keys.map((k) => {
              const m = c.metrics[k];
              const list = mode === 'annual' ? m.annual : CONCEPTS[k].kind === 'flow' ? m.quarters : m.quarters;
              const by = new Map(list.map((p) => [p.end, p.val]));
              return <tr key={k}><td>{CONCEPTS[k].label}</td>{ends.map((e) => <td key={e}>{by.has(e) ? fmt(k, by.get(e)!) : '—'}</td>)}{mode === 'annual' && <td><b>{m.ttm ? fmt(k, m.ttm.val) : '—'}</b></td>}</tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: 11, marginTop: 6 }}>From the company’s 10-K/10-Q XBRL filings. TTM = last fiscal year + this year-to-date − the same period last year; balance-sheet TTM column is the latest reported value.</p>
    </>
  );
}

export function CompanyPage({ ticker, onClose, onTicker }: { ticker: string; onClose: () => void; onTicker: (t: string) => void }) {
  const co = useSource(companySource(ticker));
  const q = useQuotes([ticker]);
  const net = useSource(NETWORK);
  const [range, setRange] = useState('1Y');
  const [style, setStyle] = useChartStyle();
  const ch = useSource(chartSource(ticker, range));
  const x = q.data?.[ticker];
  const c = co.data;
  // The website builds full pages for the companies it tracks; any other listing gets the screener's facts.
  const sc = useSource(SCREENER);
  const row = sc.data?.find((r) => r.s === ticker);
  const partial = STATIC && !TRACKED.includes(ticker);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { document.title = `${ticker} · Parallax`; return () => { document.title = 'Parallax'; }; }, [ticker]);
  const links = useMemo(() => (net.data?.people ?? []).filter((p) => p.links.length > 1 && p.links.some((l) => l.ticker === ticker)), [net.data, ticker]);
  const buys = (c?.insiders ?? []).filter((t) => t.code === 'P'), sells = (c?.insiders ?? []).filter((t) => t.code === 'S');
  const val = (l: typeof buys) => l.reduce((s, t) => s + (t.shares ?? 0) * (t.price ?? 0), 0);
  return (
    <div className="copage" role="dialog" aria-label={`${ticker} company page`}>
      <div className="co-top">
        <button className="btn" onClick={onClose}>← Terminal</button>
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', letterSpacing: '.12em' }}>{ticker} US EQUITY · DES</div>
          <h1>{c?.name ?? x?.name ?? row?.n ?? ticker}</h1>
          <div className="dim" style={{ fontSize: 12 }}>{[c?.industry ?? row?.ind, c?.exchange, c?.state && `Inc. ${c.state}`, c?.fiscalYearEnd && `FY ends ${c.fiscalYearEnd.slice(0, 2)}/${c.fiscalYearEnd.slice(2)}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="sp" />
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{x ? price(x.price) : row ? price(row.p) : '—'}</div>
          <div className="mono"><Chg v={x?.changePct ?? row?.ch} /> <span className="faint">{x?.currency ?? (row ? 'USD' : '')}</span></div>
        </div>
      </div>
      {partial ? (
        <div className="co-grid">
          <Panel title="Overview" src={sc} span="c8" hasData={!!sc.data}
            note="From Nasdaq’s stock screener (prices delayed, as of the site’s last update). Short volume is FINRA’s daily Reg SHO file.">
            {row ? <div className="kpis">
              <div className="kpi"><span>Price</span><b><Big>{price(row.p)}</Big></b><small><Chg v={row.ch} /> today</small></div>
              <div className="kpi"><span>Market value</span><b><Big>{isNum(row.mc) ? '$' + big(row.mc, 1) : '—'}</Big></b></div>
              <div className="kpi"><span>Volume</span><b><Big>{isNum(row.v) ? big(row.v, 1) : '—'}</Big></b><small>shares today</small></div>
              <div className="kpi"><span>Sector</span><b style={{ fontSize: 16 }}>{row.sec || '—'}</b><small>{row.ind}</small></div>
              <div className="kpi"><span>Country</span><b style={{ fontSize: 16 }}>{row.cty || '—'}</b></div>
            </div> : <div className="empty">{sc.data ? `${ticker} isn’t a US-listed stock in Nasdaq’s screener.` : 'Loading…'}</div>}
            <p className="faint" style={{ fontSize: 12.5, marginTop: 14 }}>The website builds full pages (charts, financials, filings, insider trades, analyst ratings) for the {TRACKED.length} companies it tracks. Run Parallax on your computer for a full page of any company.</p>
          </Panel>
          <ShortCard t={ticker} shares={row && isNum(row.mc) ? row.mc / row.p : null} />
        </div>
      ) : <div className="co-grid">
        <Panel title="Price" src={[q, ch]} span="c8" hasData={!!ch.data || !!x} right={<div className="tabrow"><Tabs small value={style} onChange={setStyle} options={[['line', 'Line'], ['candles', 'Candles']]} /><Tabs small value={range} onChange={setRange} options={Object.keys(RANGES).map((k) => [k, k] as [string, string])} /></div>}>
          {ch.data && ch.data.c.length > 1 ? <PriceChart bars={ch.data} style={style} h={240} base={range === '1D' ? x?.prev ?? ch.data.prevClose : undefined} intraday={range === '1D' || range === '5D'} /> : <div className="empty">{ch.error ?? 'Loading chart…'}</div>}
          {x && <div className="legend"><span>Day {price(x.dayLow)} – {price(x.dayHigh)}</span><span>52W {price(x.yearLow)} – {price(x.yearHigh)}</span>{isNum(x.yearHigh) && <span>{pct((x.price / x.yearHigh - 1) * 100, 1)} from 52W high</span>}</div>}
        </Panel>
        <Panel title="Key figures" src={co} span="c4" note="Valuation uses the live price and SEC-reported shares and earnings.">
          {c && <Stats c={c} px={x?.price ?? null} />}
        </Panel>
        <AnalystRatings t={ticker} />
        <ShortCard t={ticker} shares={c?.shares?.val ?? null} />
        <Panel title="Profile" src={co} span="c4">
          {c && <>
            {c.description ? <p style={{ fontSize: 12.5, marginBottom: 10 }}>{c.description}</p> : <p className="dim" style={{ fontSize: 12 }}>The SEC record has no business description; see the latest 10-K below.</p>}
            <table className="t"><tbody>
              <tr><td>SEC CIK</td><td>{Number(c.cik)}</td></tr>
              <tr><td>SIC code</td><td>{c.sic}</td></tr>
              {c.website && <tr><td>Website</td><td><a href={c.website.startsWith('http') ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer">{c.website.replace(/^https?:\/\//, '')}</a></td></tr>}
              <tr><td>Insiders on file</td><td>{c.people.length}</td></tr>
            </tbody></table>
          </>}
        </Panel>
        <Panel title="Financials (FA)" src={co} span="c8">{c && <Financials c={c} />}</Panel>
        <Panel title="Connections" src={net} span="c4" hasData={net.status !== 'error' || !!net.data}
          note="People who are insiders here and at other companies this terminal tracks (from Form 4 filings).">
          {links.length ? <ul className="feed">{links.map((p) => (
            <li key={p.cik}><span className="ttl"><b>{p.name}</b><small>{p.links.map((l) => `${l.ticker}: ${l.role}`).join(' · ')}</small></span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{p.links.filter((l) => l.ticker !== ticker).map((l) => <button key={l.ticker} className="btn" onClick={() => onTicker(l.ticker)}>{l.ticker}</button>)}</span></li>
          ))}</ul> : <div className="empty">{net.data ? 'No shared insiders with other tracked companies.' : 'Network data not built yet.'}</div>}
        </Panel>
        <Panel title="Insider transactions (Form 4)" src={co} span="c8" note={c ? `Last ${c.insiders.length} transactions from recent Form 4 filings. Open-market buys (P) and sales (S) are the signal; awards, exercises and tax withholding are routine.` : undefined}>
          {c && <>
            <div className="kpis">
              <div className="kpi"><span>Open-market buys</span><b className="up"><Big>{buys.length}</Big></b><small>${big(val(buys))}</small></div>
              <div className="kpi"><span>Open-market sales</span><b className="down"><Big>{sells.length}</Big></b><small>${big(val(sells))}</small></div>
              <div className="kpi"><span>Latest filing</span><b style={{ fontSize: 14 }}><Big>{c.insiders[0] ? dateLabel(c.insiders[0].date) : '—'}</Big></b></div>
            </div>
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              <table className="t">
                <thead><tr><th>Date</th><th>Insider</th><th>Type</th><th>Shares</th><th>Price</th><th>Value</th><th>Owned after</th></tr></thead>
                <tbody>{c.insiders.map((t, i) => (
                  <tr key={i}><td className="dim">{dateLabel(t.date, true)}</td><td className="l" style={{ fontFamily: 'var(--sans)' }}><a href={t.link} target="_blank" rel="noreferrer">{t.owner}</a><br /><small className="faint">{t.role}</small></td>
                    <td className={t.code === 'P' ? 'up' : t.code === 'S' ? 'down' : 'dim'}>{t.codeLabel}</td><td>{t.shares != null ? (t.acquired === false ? '−' : '+') + num(t.shares, 0) : '—'}</td>
                    <td>{t.price ? '$' + t.price.toFixed(2) : '—'}</td><td>{t.shares && t.price ? '$' + big(t.shares * t.price) : '—'}</td><td className="dim">{t.after != null ? big(t.after) : '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>}
        </Panel>
        <CompanyNews t={ticker} />
        <Panel title="Filings (CF)" src={co} span="c12">
          {c && <table className="t"><thead><tr><th>Form</th><th>Filed</th><th>Description</th></tr></thead><tbody>
            {c.filings.map((f, i) => <tr key={i}><td><a href={f.link} target="_blank" rel="noreferrer"><b className="mono">{f.form}</b></a></td><td className="dim">{dateLabel(f.date)}</td><td className="l" style={{ fontFamily: 'var(--sans)', whiteSpace: 'normal' }}>{f.desc}{f.items ? <small className="faint"> · Items {f.items}</small> : ''}</td></tr>)}
          </tbody></table>}
        </Panel>
      </div>}
      {STATIC && co.status === 'error' && <p className="dim" style={{ padding: '0 16px 20px', fontSize: 12 }}>The website includes company pages for the stocks it tracks. Run FINTEL locally (npm run dev) to open any SEC-registered company.</p>}
    </div>
  );
}

function CompanyNews({ t }: { t: string }) {
  const n = useSource(companyNewsSource(t));
  const now = useNow();
  return (
    <Panel title="News" src={n} span="c4" note="Company news from Finnhub, last 10 days.">
      <ul className="feed">
        {(n.data ?? []).slice(0, 10).map((x, i) => (
          <li key={i}><span className="meta">{ago(x.t, now)}</span>
            <span className="ttl"><a href={x.url} target="_blank" rel="noopener noreferrer">{x.headline}</a><small>{x.source}</small></span></li>
        ))}
        {n.data && !n.data.length && <li className="dim">No news in the last 10 days.</li>}
      </ul>
    </Panel>
  );
}
