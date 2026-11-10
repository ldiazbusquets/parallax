import { useMemo, useState } from 'react';
import { RATINGS, ratingSource, recLabel, recScore, SCREENER, SHORTS, SHORT_VOL, TRACKED, type Rec, type ScreenRow } from '@/data/equity';
import { useSource } from '@/data/store';
import { big, dateLabel, isNum, num, pct, price } from '@/lib/format';
import { STATIC } from '@/lib/env';
import { Chg, Panel, Tabs, Big } from '@/ui/kit';
import { T } from '@/ui/theme';
import { openCompany } from './company';

// ---------------------------------------------------------------- screener (every US-listed stock)
const CAPS: [string, string, number, number][] = [['all', 'All', 0, Infinity], ['mega', 'Mega', 200e9, Infinity], ['large', 'Large', 10e9, 200e9], ['mid', 'Mid', 2e9, 10e9], ['small', 'Small', 300e6, 2e9], ['micro', 'Micro', 0, 300e6]];
type SortKey = 's' | 'p' | 'ch' | 'mc' | 'v' | 'sv' | 'rec';

export function Screener() {
  const sc = useSource(SCREENER);
  const sv = useSource(SHORT_VOL);
  const rt = useSource(RATINGS);
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [cap, setCap] = useState('large');
  const [move, setMove] = useState<'any' | 'up' | 'down' | 'big'>('any');
  const [sort, setSort] = useState<[SortKey, 1 | -1]>(['mc', -1]);
  const [n, setN] = useState(40);
  const ratings = rt.data;
  const sectors = useMemo(() => [...new Set((sc.data ?? []).map((r) => r.sec).filter(Boolean))].sort(), [sc.data]);
  const svPct = (s: string) => { const x = sv.data?.rows[s]; return x ? (x[0] / x[1]) * 100 : null; };
  const val = (r: ScreenRow, k: SortKey): number | string | null => (k === 's' ? r.s : k === 'sv' ? svPct(r.s) : k === 'rec' ? recScore(ratings?.[r.s]?.[0]) : r[k]);
  const rows = useMemo(() => {
    const [lo, hi] = (CAPS.find((c) => c[0] === cap) ?? CAPS[0]).slice(2) as [number, number];
    const needle = q.trim().toLowerCase();
    const out = (sc.data ?? []).filter((r) =>
      (cap === 'all' || (isNum(r.mc) && r.mc >= lo && r.mc < hi)) && (!sector || r.sec === sector)
      && (move === 'any' || (isNum(r.ch) && (move === 'up' ? r.ch > 0 : move === 'down' ? r.ch < 0 : Math.abs(r.ch) >= 5)))
      && (!needle || r.s.toLowerCase().startsWith(needle) || r.n.toLowerCase().includes(needle) || r.ind.toLowerCase().includes(needle)));
    const [k, dir] = sort;
    return out.sort((a, b) => {
      const x = val(a, k), y = val(b, k);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * dir;
    });
  }, [sc.data, sv.data, ratings, q, sector, cap, move, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={'sortable ' + cls} aria-sort={sort[0] === k ? (sort[1] > 0 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort([k, sort[0] === k ? (sort[1] === 1 ? -1 : 1) : k === 's' ? 1 : -1])}>{label}{sort[0] === k ? (sort[1] > 0 ? ' ↑' : ' ↓') : ''}</button>
    </th>
  );
  const adv = rows.filter((r) => isNum(r.ch) && r.ch > 0).length, dec = rows.filter((r) => isNum(r.ch) && r.ch < 0).length;
  return (
    <Panel id="p-screener" title="Stock screener" src={[sc, sv]} span="c12" hasData={!!sc.data}
      note={`Every US-listed stock from Nasdaq’s screener (prices delayed). Short vol. = share of yesterday’s volume sold short (FINRA Reg SHO${sv.data ? ', ' + dateLabel(sv.data.date) : ''}); a high share is common for market makers and isn’t short interest.${STATIC ? ' Analyst consensus (Finnhub) is shown for the companies this site tracks.' : ''} Click a row for the company page.`}>
      <div className="screen-ctl">
        <input className="in" placeholder="Symbol, name or industry" value={q} onChange={(e) => { setQ(e.target.value); setN(40); }} aria-label="Search stocks" />
        <select className="in" value={sector} onChange={(e) => { setSector(e.target.value); setN(40); }} aria-label="Sector">
          <option value="">All sectors</option>{sectors.map((x) => <option key={x}>{x}</option>)}
        </select>
        <Tabs small value={cap} onChange={(v) => { setCap(v); setN(40); }} options={CAPS.map((c) => [c[0], c[1]] as [string, string])} />
        <Tabs small value={move} onChange={(v) => { setMove(v); setN(40); }} options={[['any', 'Any move'], ['up', 'Up'], ['down', 'Down'], ['big', '±5%+']]} />
        <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>{num(rows.length, 0)} stocks · <span className="up">{adv} up</span> · <span className="down">{dec} down</span></span>
      </div>
      <div className="tscroll">
        <table className="t screen">
          <thead><tr>{th('s', 'Symbol', 'l')}<th className="l hide-s">Name</th>{th('p', 'Price')}{th('ch', 'Chg')}{th('mc', 'Mkt cap')}{th('v', 'Volume', 'hide-s')}{th('sv', 'Short vol.', 'hide-s')}{STATIC && th('rec', 'Analysts', 'hide-s')}<th className="l hide-m">Industry</th></tr></thead>
          <tbody>
            {rows.slice(0, n).map((r) => {
              const s = svPct(r.s), rec = recScore(ratings?.[r.s]?.[0]);
              return <tr key={r.s} className="click" onClick={() => openCompany(r.s)}>
                <td className="l"><b className="mono">{r.s}</b><small className="only-s">{r.n}</small></td><td className="l hide-s nm">{r.n}</td>
                <td>{price(r.p)}</td><td><Chg v={r.ch} /></td><td>{isNum(r.mc) ? '$' + big(r.mc, 1) : '—'}</td>
                <td className="hide-s dim">{isNum(r.v) ? big(r.v, 1) : '—'}</td>
                <td className="hide-s">{isNum(s) ? <span className={s >= 60 ? 'warm' : ''}>{s.toFixed(0)}%</span> : '—'}</td>
                {STATIC && <td className="hide-s">{isNum(rec) ? <span title={rec.toFixed(2) + ' on a 1 (strong buy) to 5 (strong sell) scale'} className={rec <= 2.5 ? 'up' : rec > 3.5 ? 'down' : 'dim'}>{recLabel(rec)}</span> : <span className="faint">—</span>}</td>}
                <td className="l hide-m dim nm">{r.ind || r.sec}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {rows.length > n && <button className="btn" style={{ marginTop: 10 }} onClick={() => setN(n + 60)}>Show more ({num(rows.length - n, 0)} left)</button>}
      {sc.data && !rows.length && <div className="empty">No stocks match these filters.</div>}
    </Panel>
  );
}

// ---------------------------------------------------------------- short interest for the tracked companies
export function ShortInterest() {
  const s = useSource(SHORTS);
  const sv = useSource(SHORT_VOL);
  const [by, setBy] = useState<'dtc' | 'chg'>('dtc');
  const list = Object.entries(s.data ?? {}).filter(([t]) => TRACKED.includes(t))
    .sort((a, b) => (by === 'dtc' ? (b[1].dtc ?? -1) - (a[1].dtc ?? -1) : (b[1].chgPct ?? -999) - (a[1].chgPct ?? -999)));
  const date = list[0]?.[1].date;
  return (
    <Panel id="p-shorts" title="Short interest" src={[s, sv]} span="c4" hasData={!!s.data}
      right={<Tabs small value={by} onChange={setBy} options={[['dtc', 'Days to cover'], ['chg', 'Change']]} />}
      note={`Shares sold short and not yet covered, reported to FINRA twice a month${date ? ` (settled ${dateLabel(date)})` : ''}. Days to cover = short shares ÷ average daily volume. Short vol. is yesterday’s short-sale share of volume.`}>
      <table className="t">
        <thead><tr><th>Stock</th><th>Short</th><th>Chg</th><th>Days</th><th>Short vol.</th></tr></thead>
        <tbody>
          {list.map(([t, x]) => {
            const v = sv.data?.rows[t];
            return <tr key={t} className="click" onClick={() => openCompany(t)}>
              <td><b className="mono">{t}</b></td><td>{big(x.short, 1)}</td><td>{isNum(x.chgPct) ? <Chg v={x.chgPct} dp={1} invert /> : '—'}</td>
              <td>{isNum(x.dtc) ? x.dtc.toFixed(1) : '—'}</td><td className="dim">{v ? ((v[0] / v[1]) * 100).toFixed(0) + '%' : '—'}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------- company page cards
const REC_COLS: [keyof Omit<Rec, 'period'>, string, string][] = [['sb', 'Strong buy', '#3fae62'], ['b', 'Buy', '#5fd07a'], ['h', 'Hold', '#8a8a8a'], ['s', 'Sell', '#ff7a6e'], ['ss', 'Strong sell', '#ff5147']];
export function AnalystRatings({ t }: { t: string }) {
  const r = useSource(ratingSource(t));
  const list = r.data ?? [];
  const cur = list[0], score = recScore(cur);
  const total = cur ? cur.sb + cur.b + cur.h + cur.s + cur.ss : 0;
  return (
    <Panel title="Analyst ratings" src={r} span="c4" note="Count of analyst recommendations each month (Finnhub). Consensus on a 1 (strong buy) to 5 (strong sell) scale.">
      {cur && total ? <>
        <div className="kpis">
          <div className="kpi"><span>Consensus</span><b className={score! <= 2.5 ? 'up' : score! > 3.5 ? 'down' : ''}><Big>{recLabel(score)}</Big></b><small>{score!.toFixed(2)} · {total} analysts</small></div>
          <div className="kpi"><span>Buy share</span><b><Big>{pct(((cur.sb + cur.b) / total) * 100, 0, false)}</Big></b><small>{dateLabel(cur.period, true)}</small></div>
        </div>
        <div className="recbars">
          {list.slice(0, 4).map((m) => {
            const n = m.sb + m.b + m.h + m.s + m.ss || 1;
            return <div key={m.period} className="recrow"><span className="dim">{new Date(m.period + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</span>
              <div className="recbar" role="img" aria-label={REC_COLS.map(([k, l]) => `${l} ${m[k]}`).join(', ')}>{REC_COLS.map(([k, l, c]) => m[k] ? <i key={k} style={{ width: (m[k] / n) * 100 + '%', background: c }} title={`${l}: ${m[k]}`} /> : null)}</div>
              <span className="mono dim">{n}</span></div>;
          })}
        </div>
        <div className="legend">{REC_COLS.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l} {cur[k]}</span>)}</div>
      </> : <div className="empty">{r.data ? 'No analyst coverage reported.' : r.error ?? 'Loading…'}</div>}
    </Panel>
  );
}

export function ShortCard({ t, shares, sharesFrom = 'SEC share count' }: { t: string; shares: number | null; sharesFrom?: string }) {
  const s = useSource(SHORTS);
  const sv = useSource(SHORT_VOL);
  const sc = useSource(SCREENER);
  const x = s.data?.[t], v = sv.data?.rows[t];
  // SEC's cover-page share count is missing for some multi-class companies; Nasdaq's market cap ÷ price is the fallback
  const row = shares ? undefined : sc.data?.find((r) => r.s === t);
  const out = shares ?? (row && isNum(row.mc) ? row.mc / row.p : null);
  return (
    <Panel title="Short interest" src={[s, sv]} span="c4" hasData={!!s.data || !!sv.data}
      note="Short interest is reported to FINRA twice a month. Short volume is the share of yesterday’s trading sold short (FINRA Reg SHO), which includes market-maker hedging.">
      <div className="kpis">
        <div className="kpi"><span>Shares short</span><b><Big>{x ? big(x.short, 1) : '—'}</Big></b><small>{x ? `settled ${dateLabel(x.date)}` : STATIC && s.data ? 'not tracked here' : ''}</small></div>
        <div className="kpi"><span>% of shares out</span><b><Big>{x && out ? pct((x.short / out) * 100, 1, false) : '—'}</Big></b><small>{shares ? sharesFrom : out ? 'Nasdaq market value ÷ price' : ''}</small></div>
        <div className="kpi"><span>Change</span><b><Big>{x && isNum(x.chgPct) ? <Chg v={x.chgPct} dp={1} invert /> : '—'}</Big></b><small>vs prior report</small></div>
        <div className="kpi"><span>Days to cover</span><b><Big>{x && isNum(x.dtc) ? x.dtc.toFixed(1) : '—'}</Big></b></div>
        <div className="kpi"><span>Short volume</span><b style={{ color: v && v[0] / v[1] >= 0.6 ? T.accent2 : undefined }}><Big>{v ? pct((v[0] / v[1]) * 100, 0, false) : '—'}</Big></b><small>{sv.data ? dateLabel(sv.data.date) : ''}</small></div>
      </div>
    </Panel>
  );
}
