import { useEffect, useMemo, useRef, useState } from 'react';
import { chart, chartAsOf, spark, SNAP_FILES, useQuotes, type Bars, type Quote, isStaleQuote } from '@/data/yahoo';
import { snapTime, STATIC } from '@/lib/env';
import { sourceFor, useSource } from '@/data/store';
import { COMMODITIES, DEFAULT_WATCHLIST, FX, INDICES, SECTORS, TAPE, VOL } from '@/data/universe';
import { big, isNum, num, pct, price } from '@/lib/format';
import { Chg, Panel, RangeBar, Spark, Tabs, Big } from '@/ui/kit';
import { heat, T } from '@/ui/theme';
import { squarify } from '@/ui/treemap';
import { SCREENER, SECTOR_FIX, topCompanies } from '@/data/equity';
import { PriceChart, useChartStyle } from '@/ui/charts';

// ---------------------------------------------------------------- ticker tape
export function Tape() {
  const q = useQuotes(TAPE.map((x) => x[0]));
  const items = TAPE.map(([s, l]) => ({ s, l, q: q.data?.[s] })).filter((x) => x.q);
  if (!items.length) return <div className="tape" />;
  const row = items.map(({ s, l, q }) => (
    <span className="tape-it" key={s}><span className="l">{l}</span><span className="num">{price(q!.price)}</span><Chg v={q!.changePct} /></span>
  ));
  return <div className="tape" aria-label="Market ticker"><div className="tape-in">{row}{row}</div></div>;
}

// ---------------------------------------------------------------- shared quote table
function QuoteRows({ items, q, onPick, sel, range = true }: { items: [string, string][]; q?: Record<string, Quote>; onPick?: (s: string) => void; sel?: string; range?: boolean }) {
  return (
    <>
      {items.map(([s, label]) => {
        const x = q?.[s];
        return (
          <tr key={s} className={(onPick ? 'click' : '') + (sel === s ? ' sel' : '')} onClick={onPick ? () => onPick(s) : undefined}>
            <td>{label}</td>
            <td>{x ? price(x.price) : '—'}</td>
            <td>{x && isStaleQuote(x) ? <small className="faint" title={`No trades since ${new Date(x.time).toDateString()} at the source`}>as of {new Date(x.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small> : <Chg v={x?.changePct} />}</td>
            <td><Spark data={x?.spark ?? []} base={x?.prev} w={64} h={18} /></td>
            {range && <td className="hs"><RangeBar lo={x?.yearLow} hi={x?.yearHigh} v={x?.price} w={54} /></td>}
          </tr>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- global indices
export function Indices() {
  const all = INDICES.flatMap((r) => r.items);
  const q = useQuotes(all.map((x) => x[0]));
  return (
    <Panel id="p-indices" title="Global equity indices" src={q} span="c4" note="Change vs prior close · bar = position in 52-week range">
      <table className="t">
        <thead><tr><th>Index</th><th>Last</th><th>Chg</th><th>Today</th><th className="hs">52W</th></tr></thead>
        <tbody>
          {INDICES.map((r) => [
            <tr className="grp" key={r.region}><td colSpan={5}>{r.region}</td></tr>,
            <QuoteRows key={r.region + 'r'} items={r.items} q={q.data} />,
          ])}
        </tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------- sectors with multi-period returns
const SECTOR_HIST = sourceFor('yahoo:sectors3mo', () => ({
  id: 'yahoo:sectors3mo', label: 'Sector history', provider: 'Yahoo Finance', every: 30 * 60_000,
  asOf: STATIC ? snapTime(SNAP_FILES['1y']) : undefined,
  fetch: () => spark([...SECTORS.map((s) => s[0]), 'SPY'], '6mo', '1d'),
}));
function retOver(q: Quote | undefined, days: number): number | null {
  const c = q?.spark; if (!c || c.length <= days) return null;
  return (c[c.length - 1] / c[c.length - 1 - days] - 1) * 100;
}
export function Sectors() {
  const q = useQuotes([...SECTORS.map((s) => s[0]), 'SPY']);
  const h = useSource(SECTOR_HIST);
  const [sort, setSort] = useState<'1d' | '1w' | '1m' | '3m'>('1d');
  const rows = SECTORS.map(([s, l]) => {
    const hq = h.data?.[s];
    return { s, l, d1: q.data?.[s]?.changePct ?? null, w1: retOver(hq, 5), m1: retOver(hq, 21), m3: retOver(hq, 63) };
  });
  const key = { '1d': 'd1', '1w': 'w1', '1m': 'm1', '3m': 'm3' }[sort] as 'd1' | 'w1' | 'm1' | 'm3';
  rows.sort((a, b) => (b[key] ?? -1e9) - (a[key] ?? -1e9));
  const spy = { d1: q.data?.SPY?.changePct ?? null, w1: retOver(h.data?.SPY, 5), m1: retOver(h.data?.SPY, 21), m3: retOver(h.data?.SPY, 63) };
  const max = Math.max(1, ...rows.map((r) => Math.abs(r[key] ?? 0)));
  const up = rows.filter((r) => (r.d1 ?? 0) > 0).length;
  return (
    <Panel id="p-sectors" title="US sectors" src={[q, h]} span="c4" right={<Tabs value={sort} onChange={setSort} small options={[['1d', '1D'], ['1w', '1W'], ['1m', '1M'], ['3m', '3M']]} />}
      note={`SPDR sector ETFs · ${up} of 11 up today · sorted by ${sort.toUpperCase()}`}>
      <table className="t">
        <thead><tr><th>Sector</th><th className="hs" style={{ width: '32%' }} /><th>1D</th><th className="hs">1W</th><th>1M</th><th>3M</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const v = r[key] ?? 0;
            return (
              <tr key={r.s}>
                <td>{r.l}<span className="sym">{r.s}</span></td>
                <td className="hs"><div style={{ display: 'flex', justifyContent: v >= 0 ? 'flex-start' : 'flex-end', width: '100%' }}><i style={{ display: 'block', height: 6, borderRadius: 2, width: `${(Math.abs(v) / max) * 50}%`, background: v >= 0 ? T.up : T.down, marginLeft: v >= 0 ? '50%' : 0, marginRight: v < 0 ? '50%' : 0 }} /></div></td>
                <td><Chg v={r.d1} /></td><td className="hs"><Chg v={r.w1} /></td><td><Chg v={r.m1} /></td><td><Chg v={r.m3} /></td>
              </tr>
            );
          })}
          <tr><td className="dim">S&amp;P 500<span className="sym">SPY</span></td><td className="hs" /><td><Chg v={spy.d1} /></td><td className="hs"><Chg v={spy.w1} /></td><td><Chg v={spy.m1} /></td><td><Chg v={spy.m3} /></td></tr>
        </tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------- volatility
export function Volatility() {
  const q = useQuotes(VOL.map((v) => v[0]));
  const vix = q.data?.['^VIX']?.price, v3 = q.data?.['^VIX3M']?.price, v9 = q.data?.['^VIX9D']?.price;
  const ratio = isNum(vix) && isNum(v3) ? vix / v3 : null;
  const regime = !isNum(vix) ? '—' : vix < 15 ? 'Calm' : vix < 20 ? 'Normal' : vix < 30 ? 'Elevated' : 'Stressed';
  return (
    <Panel id="p-vol" title="Volatility" src={q} span="c4" note="Term structure: VIX ÷ VIX3M above 1 (backwardation) usually means near-term stress.">
      <div className="kpis">
        <div className="kpi"><span>VIX regime</span><b><Big>{regime}</Big></b><small>{isNum(vix) ? num(vix) : '—'}</small></div>
        <div className="kpi"><span>VIX / VIX3M</span><b className={isNum(ratio) && ratio > 1 ? 'down' : ''}><Big>{isNum(ratio) ? ratio.toFixed(2) : '—'}</Big></b><small>{isNum(ratio) ? (ratio > 1 ? 'backwardation' : 'contango') : ''}</small></div>
        <div className="kpi"><span>9D − 30D</span><b><Big>{isNum(v9) && isNum(vix) ? (v9 - vix > 0 ? '+' : '') + (v9 - vix).toFixed(2) : '—'}</Big></b><small>front-end spread</small></div>
      </div>
      <table className="t">
        <thead><tr><th>Gauge</th><th>Level</th><th>Chg</th><th>Today</th></tr></thead>
        <tbody>
          {VOL.map(([s, l, what]) => {
            const x = q.data?.[s];
            return <tr key={s}><td>{l} <small className="faint">{what}</small></td><td>{x ? num(x.price) : '—'}</td><td><Chg v={x?.changePct} invert /></td><td><Spark data={x?.spark ?? []} base={x?.prev} w={64} h={18} color={x && x.price >= (x.prev ?? x.price) ? T.down : T.up} /></td></tr>;
          })}
        </tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------- commodities
export function Commodities() {
  const all = COMMODITIES.flatMap((g) => g.items);
  const q = useQuotes(all.map((x) => x[0]));
  const wti = q.data?.['CL=F']?.price, brent = q.data?.['BZ=F']?.price, gold = q.data?.['GC=F']?.price, silver = q.data?.['SI=F']?.price, cu = q.data?.['HG=F']?.price;
  return (
    <Panel id="p-cmdty" title="Commodities" src={q} span="c4" note="Front-month futures. Copper/gold uses copper $/lb ÷ gold $/oz × 1000.">
      <div className="kpis">
        <div className="kpi"><span>Brent − WTI</span><b><Big>{isNum(wti) && isNum(brent) ? '$' + (brent - wti).toFixed(2) : '—'}</Big></b></div>
        <div className="kpi"><span>Gold / silver</span><b><Big>{isNum(gold) && isNum(silver) ? (gold / silver).toFixed(1) : '—'}</Big></b></div>
        <div className="kpi"><span>Copper / gold</span><b><Big>{isNum(gold) && isNum(cu) ? ((cu / gold) * 1000).toFixed(2) : '—'}</Big></b></div>
      </div>
      <table className="t">
        <thead><tr><th>Contract</th><th>Last</th><th>Chg</th><th>Today</th><th className="hs">52W</th></tr></thead>
        <tbody>
          {COMMODITIES.map((g) => [<tr className="grp" key={g.group}><td colSpan={5}>{g.group}</td></tr>, <QuoteRows key={g.group + 'r'} items={g.items} q={q.data} />])}
        </tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------- FX
export function Currencies() {
  const q = useQuotes(FX.map((x) => x[0]));
  return (
    <Panel id="p-fx" title="Currencies" src={q} span="c4" note="USD/xxx pairs: up means the dollar strengthened.">
      <table className="t">
        <thead><tr><th>Pair</th><th>Last</th><th>Chg</th><th>Today</th><th className="hs">52W</th></tr></thead>
        <tbody><QuoteRows items={FX} q={q.data} /></tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------- heatmap
// The largest US-listed companies as a treemap: each box is sized by market value and grouped by sector, so the
// names that move the market look as big as they are. Data: the Nasdaq screener (every US listing, prices delayed).
const SECTOR_NAME: Record<string, string> = { Technology: 'Technology', Finance: 'Financials', 'Health Care': 'Health care', 'Consumer Discretionary': 'Consumer discretionary', Industrials: 'Industrials', Telecommunications: 'Telecom', Energy: 'Energy', 'Real Estate': 'Real estate', Utilities: 'Utilities', 'Basic Materials': 'Materials', 'Consumer Staples': 'Consumer staples', Miscellaneous: 'Other' };
// Listings that aren't a company's common stock (preferreds, notes, depositary units) carry the parent's market value.
interface HmStock { s: string; n: string; p: number; ch: number; mc: number }
interface HmSector { id: string; name: string; mc: number; ch: number; items: HmStock[] }
export function Heatmap({ onPick }: { onPick: (s: string) => void }) {
  const sc = useSource(SCREENER);
  const [top, setTop] = useState('200');
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el); setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [!!sc.data]); // eslint-disable-line react-hooks/exhaustive-deps -- the box mounts once data arrives
  // more companies need more room for their labels
  const H = (W && W < 600 ? 460 : 540) + (top === '500' ? 220 : top === '200' ? 80 : 0);
  const sectors = useMemo<HmSector[]>(() => {
    const pick: HmStock[] = [];
    for (const r of topCompanies(sc.data ?? [], +top, true)) pick.push({ s: r.s, n: r.n, p: r.p, ch: r.ch!, mc: r.mc! });
    const by = new Map<string, HmSector>();
    for (const x of pick) {
      const id = (sc.data ?? []).find((r) => r.s === x.s)?.sec || SECTOR_FIX[x.s] || 'Miscellaneous';
      const g = by.get(id) ?? { id, name: SECTOR_NAME[id] ?? id, mc: 0, ch: 0, items: [] };
      g.items.push(x); g.mc += x.mc; g.ch += x.ch * x.mc; by.set(id, g);
    }
    return [...by.values()].map((g) => ({ ...g, ch: g.ch / g.mc })).sort((a, b) => b.mc - a.mc);
  }, [sc.data, top]);
  const layout = useMemo(() => {
    if (!W || !sectors.length) return [];
    return squarify(sectors, (g) => g.mc, { x: 0, y: 0, w: W, h: H }).map((sr) => {
      const head = sr.w > 70 && sr.h > 46 ? 18 : 0;
      const inner = { x: sr.x + 1, y: sr.y + head + 1, w: sr.w - 2, h: sr.h - head - 2 };
      return { ...sr, head, tiles: squarify(sr.item.items, (x) => x.mc, inner) };
    });
  }, [sectors, W, H]);
  const all = sectors.flatMap((g) => g.items);
  const totMc = all.reduce((a, x) => a + x.mc, 0);
  const wAvg = totMc ? all.reduce((a, x) => a + x.ch * x.mc, 0) / totMc : null;
  const adv = all.filter((x) => x.ch > 0).length;
  return (
    <Panel id="p-heatmap" title="Market heatmap" src={sc} span="c8" hasData={!!sc.data}
      right={<div className="tabrow"><span className="mono dim hm-sum">{all.length ? <>{adv}/{all.length} up · weighted <Chg v={wAvg} /></> : null}</span><Tabs small value={top} onChange={setTop} options={[['100', 'Top 100'], ['200', 'Top 200'], ['500', 'Top 500']]} /></div>}
      note="The largest US-listed companies by market value (one box per company), sized by market value and grouped by sector; colour is today’s change, from −3% (red) to +3% (green). Sector headers show the market-value-weighted change. Prices and day change come from Yahoo quotes (regular session, delayed) as of the site’s last update, shown in the card’s tooltip; after-hours moves, which apps like Robinhood include, aren’t counted. Company list, sectors and market values come from Nasdaq’s stock screener. Hover for details; click a box to open the company.">
      <div className="tm" ref={box} style={{ height: H }}>
        {layout.map((sr) => (
          <div key={sr.item.id} className="tm-s" style={{ left: sr.x, top: sr.y, width: sr.w, height: sr.h }}>
            {sr.head ? <div className="tm-h" title={`${sr.item.name}: ${sr.item.items.length} companies, $${big(sr.item.mc, 1)}, ${pct(sr.item.ch, 2)}`}><span>{sr.item.name}</span>{sr.w > 130 ? <Chg v={sr.item.ch} /> : null}</div> : null}
            {sr.tiles.map((t) => {
              // the ticker's font is sized to fit the box's width (about 0.62em per character), never below 7px
              const w = t.w - 2, h = t.h - 2, len = Math.max(2, t.item.s.length);
              const size = Math.min(26, Math.sqrt(w * h) / 4.2, (w - 4) / (len * 0.62), h * 0.62);
              const showT = size >= 7, showP = size >= 9 && h > size * 2.3 + 6;
              return (
                <button key={t.item.s} className="tm-t" style={{ left: t.x - sr.x, top: t.y - sr.y, width: Math.max(0, w), height: Math.max(0, h), background: heat(t.item.ch) }}
                  title={`${t.item.n} (${t.item.s})\n${price(t.item.p)} · ${pct(t.item.ch, 2)} · $${big(t.item.mc, 1)} market value`} onClick={() => onPick(t.item.s)}>
                  {showT ? <b style={{ fontSize: size }}>{t.item.s}</b> : null}
                  {showP ? <span style={{ fontSize: Math.max(8, size * 0.62) }}>{pct(t.item.ch, w > 60 ? 2 : 1)}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- watchlist + chart
export const RANGES: Record<string, [string, string]> = { '1D': ['1d', '5m'], '5D': ['5d', '30m'], '1M': ['1mo', '1d'], '6M': ['6mo', '1d'], '1Y': ['1y', '1d'], '5Y': ['5y', '1wk'] };
export function chartSource(sym: string, r: string) {
  return sourceFor(`yahoo:chart:${sym}:${r}`, () => ({ id: `yahoo:chart:${sym}:${r}`, label: `${sym} chart`, provider: 'Yahoo Finance', every: r === '1D' || r === '5D' ? 60_000 : 15 * 60_000, asOf: chartAsOf(RANGES[r][0]), fetch: () => chart(sym, RANGES[r][0], RANGES[r][1]) }));
}
function loadList(): string[] {
  try { const v = JSON.parse(localStorage.getItem('fintel.watchlist') || 'null'); return Array.isArray(v) && v.length ? v : DEFAULT_WATCHLIST; } catch { return DEFAULT_WATCHLIST; }
}
export function Watchlist({ sel, setSel }: { sel: string; setSel: (s: string) => void }) {
  const [list, setList] = useState<string[]>(loadList);
  const [add, setAdd] = useState('');
  const [range, setRange] = useState('1D');
  const [style, setStyle] = useChartStyle();
  const all = useMemo(() => [...new Set([...list, sel])], [list, sel]);
  const q = useQuotes(all);
  const c = useSource(chartSource(sel, range));
  const save = (l: string[]) => { setList(l); try { localStorage.setItem('fintel.watchlist', JSON.stringify(l)); } catch { /* ignore */ } };
  const x = q.data?.[sel];
  const bars: Bars | undefined = c.data;
  const first = bars?.c[0], lastC = bars?.c[bars.c.length - 1];
  const periodChg = range === '1D' ? x?.changePct : isNum(first) && isNum(lastC) ? (lastC / first - 1) * 100 : null;
  return (
    <Panel id="p-watch" title="Watchlist" src={[q, c]} span="c8" hasData={q.data !== undefined}
      right={<form onSubmit={(e) => { e.preventDefault(); const s = add.trim().toUpperCase(); if (s && !list.includes(s)) save([...list, s]); if (s) setSel(s); setAdd(''); }}>
        <input className="in" style={{ width: 120, padding: '3px 8px' }} placeholder="Add symbol" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add symbol" />
      </form>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 2fr) 3fr', gap: 14 }} className="wl">
        <table className="t">
          <thead><tr><th>Symbol</th><th>Last</th><th>Chg</th><th>Today</th><th /></tr></thead>
          <tbody>
            {list.map((s) => {
              const y = q.data?.[s];
              return (
                <tr key={s} className={'click' + (s === sel ? ' sel' : '')} onClick={() => setSel(s)}>
                  <td><b className="mono" style={{ fontSize: 12 }}>{s}</b></td><td>{y ? price(y.price) : '—'}</td><td><Chg v={y?.changePct} /></td>
                  <td><Spark data={y?.spark ?? []} base={y?.prev} w={56} h={16} /></td>
                  <td><button className="link" style={{ color: T.faint, textDecoration: 'none' }} aria-label={`Remove ${s}`} onClick={(e) => { e.stopPropagation(); save(list.filter((z) => z !== s)); }}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <b className="mono" style={{ fontSize: 15 }}>{sel}</b> <span className="dim">{x?.name ?? bars?.name ?? ''}</span>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{x ? price(x.price) : '—'} <span style={{ fontSize: 13 }}><Chg v={periodChg} /> <span className="faint">{range}</span></span></div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn" onClick={() => { location.hash = '#/c/' + sel; }} title="Company page">DES</button>
              <Tabs value={style} onChange={setStyle} small options={[['line', 'Line'], ['candles', 'Candles']]} />
              <Tabs value={range} onChange={setRange} small options={Object.keys(RANGES).map((k) => [k, k] as [string, string])} />
            </div>
          </div>
          {bars && bars.c.length > 1
            ? <PriceChart bars={bars} style={style} h={210} base={range === '1D' ? x?.prev ?? bars.prevClose : undefined} intraday={range === '1D' || range === '5D'} />
            : <div className="empty">{c.status === 'error' ? `No chart: ${c.error}` : 'Loading chart…'}</div>}
          {style === 'candles' && bars && !bars.o && <p className="faint" style={{ fontSize: 11 }}>{STATIC ? 'Candles on the website cover the tracked stocks and indices over 5D–1Y; this view has closing prices only.' : 'No open/high/low data for this range.'}</p>}
          {x && <div className="kpis" style={{ marginTop: 8 }}>
            <div className="kpi"><span>Day range</span><b style={{ fontSize: 13 }}><Big>{price(x.dayLow)} – {price(x.dayHigh)}</Big></b></div>
            <div className="kpi"><span>52-week range</span><b style={{ fontSize: 13 }}><Big>{price(x.yearLow)} – {price(x.yearHigh)}</Big></b></div>
            <div className="kpi"><span>From 52W high</span><b style={{ fontSize: 13 }}><Big><Chg v={isNum(x.yearHigh) ? (x.price / x.yearHigh - 1) * 100 : null} /></Big></b></div>
          </div>}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- S&P 500 calendar-year history
const HIST = sourceFor('yahoo:gspc:max', () => ({ id: 'yahoo:gspc:max', label: 'S&P 500 history', provider: 'Yahoo Finance', every: 6 * 60 * 60_000, asOf: STATIC ? snapTime('chart-_GSPC-max.json') : undefined, fetch: () => chart('^GSPC', 'max', '1mo') }));
export function History() {
  const h = useSource(HIST);
  const years = useMemo(() => {
    const b = h.data; if (!b) return [];
    const endOf: Record<number, number> = {};
    b.t.forEach((t, i) => { endOf[new Date(t).getUTCFullYear()] = b.c[i]; });
    const ys = Object.keys(endOf).map(Number).sort();
    return ys.slice(1).map((y) => ({ y, r: (endOf[y] / endOf[y - 1] - 1) * 100 })).slice(-30);
  }, [h.data]);
  const ath = h.data ? Math.max(...h.data.c) : null, lastV = h.data?.c[h.data.c.length - 1];
  const pos = years.filter((y) => y.r > 0).length;
  const W = 640, H = 170, max = Math.max(10, ...years.map((y) => Math.abs(y.r)));
  return (
    <Panel id="p-hist" title="S&P 500 by calendar year" src={h} span="c4" note="Price return (excludes dividends), from monthly closes. Latest year is year-to-date.">
      <div className="kpis">
        <div className="kpi"><span>Up years (last {years.length})</span><b><Big>{years.length ? `${pos} / ${years.length}` : '—'}</Big></b></div>
        <div className="kpi"><span>Avg yearly return</span><b><Big><Chg v={years.length ? years.reduce((a, b) => a + b.r, 0) / years.length : null} /></Big></b></div>
        <div className="kpi"><span>From record high</span><b><Big><Chg v={isNum(ath) && isNum(lastV) ? (lastV / ath - 1) * 100 : null} /></Big></b><small>monthly closes</small></div>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label="Bar chart of yearly returns">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke={T.lineHi} />
        {years.map((y, i) => {
          const bw = W / years.length, hgt = (Math.abs(y.r) / max) * (H / 2 - 4);
          return <g key={y.y}><rect x={i * bw + 2} width={bw - 4} y={y.r >= 0 ? H / 2 - hgt : H / 2} height={hgt} fill={y.r >= 0 ? T.up : T.down} opacity={i === years.length - 1 ? 0.55 : 0.9}><title>{`${y.y}: ${pct(y.r, 1)}`}</title></rect>
            {(i % 5 === 0 || i === years.length - 1) && <text x={i * bw + bw / 2} y={H + 14} textAnchor="middle">{String(y.y).slice(2)}</text>}</g>;
        })}
      </svg>
    </Panel>
  );
}
