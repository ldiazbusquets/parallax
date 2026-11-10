import { useMemo, useState } from 'react';
import { useSource } from '@/data/store';
import { FUNDS_SRC, holdersOf } from '@/data/funds';
import { SEASON, surprisePct, type SeasonStat } from '@/data/sources';
import type { Stake } from '@/data/company';
import { big, dateLabel, isNum, pct } from '@/lib/format';
import { Big, Chg, Panel } from '@/ui/kit';
import { T } from '@/ui/theme';
import { openCompany } from './company';

// Phase 4: who owns what. Fund portfolios (13F), 5%+ holders (13D/13G) and the earnings season's beat rate.

const STYLE: Record<string, string> = { activist: 'Activist', value: 'Value', macro: 'Macro', growth: 'Growth' };

export function FundHoldings() {
  const f = useSource(FUNDS_SRC);
  const funds = useMemo(() => [...(f.data?.funds ?? [])].sort((a, b) => b.total - a.total), [f.data]);
  const [pick, setPick] = useState<string | null>(null);
  const fund = funds.find((x) => x.cik === pick) ?? funds[0];
  return (
    <Panel id="p-funds" title="Fund holdings" src={f} span="c8"
      right={funds.length ? <select className="in" style={{ width: "auto", maxWidth: 220 }} value={fund?.cik} onChange={(e) => setPick(e.target.value)} aria-label="Fund">
        {funds.map((x) => <option key={x.cik} value={x.cik}>{x.name}</option>)}</select> : undefined}
      note="Each fund’s latest Form 13F from SEC EDGAR: US-listed stock positions at the quarter end, filed up to 45 days later, so holdings can have changed since. Options and short positions aren’t reported on 13F. Tickers come from the CUSIPs via OpenFIGI.">
      {fund && <>
        <div className="kpis">
          <div className="kpi"><span>Reported 13F value</span><b><Big>{'$' + big(fund.total, 1)}</Big></b><small>{fund.positions} positions</small></div>
          <div className="kpi"><span>Quarter</span><b style={{ fontSize: 16 }}>{dateLabel(fund.period)}</b><small>filed {dateLabel(fund.filed)}</small></div>
          <div className="kpi"><span>Top 10 weight</span><b><Big>{pct(fund.holdings.slice(0, 10).reduce((a, h) => a + h.pct, 0), 0, false)}</Big></b><small>{STYLE[fund.style]}</small></div>
        </div>
        <div style={{ maxHeight: 340, overflow: 'auto', marginTop: 10 }}>
          <table className="t">
            <thead><tr><th className="l">Company</th><th>Weight</th><th>Value</th><th className="hs">Shares</th></tr></thead>
            <tbody>{fund.holdings.map((h) => (
              <tr key={h.cusip}>
                <td className="l" style={{ fontFamily: 'var(--sans)' }}>{h.t ? <button className="link" onClick={() => openCompany(h.t!)}><b className="mono">{h.t}</b></button> : <span className="faint mono">{h.cusip}</span>} <small className="dim">{h.issuer}</small></td>
                <td><span className="wbar"><i style={{ width: `${Math.min(100, h.pct * 2)}%` }} /></span>{pct(h.pct, 1, false)}</td>
                <td>{'$' + big(h.value, 1)}</td><td className="dim hs">{big(h.shares, 1)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="faint" style={{ fontSize: 11.5, marginTop: 8 }}><a href={fund.link} target="_blank" rel="noreferrer">Open the filing on EDGAR ↗</a>{f.data?.errors.length ? ` · ${f.data.errors.length} fund(s) couldn’t be read this time` : ''}</p>
      </>}
    </Panel>
  );
}

/** Company page card: 5%+ holders from Schedules 13D/13G, plus the tracked funds that own it. */
export function HoldersCard({ t, stakes }: { t: string; stakes: Stake[] | undefined }) {
  const f = useSource(FUNDS_SRC);
  const funds = holdersOf(f.data, t);
  const list = stakes ?? [];
  return (
    <Panel title="Major holders" src={f} span="c4" hasData
      note="5%+ holders from Schedules 13D (may seek to influence the company) and 13G (passive), as filed in the SEC’s XML format since December 2024; the percentage is of the share class on the filing date. Funds are the ones Parallax follows, from their latest 13F.">
      {list.length ? <ul className="feed">{list.slice(0, 8).map((s) => (
        <li key={s.filer + s.filed}><span className="ttl"><a href={s.link} target="_blank" rel="noreferrer">{s.filer}</a>
          <small>{s.form === '13D' ? <b style={{ color: T.accent2 }}>13D</b> : '13G'}{s.amended ? ' amendment' : ''} · filed {dateLabel(s.filed)}{s.shares ? ` · ${big(s.shares, 1)} sh` : ''}</small></span>
          <span className="mono">{isNum(s.pct) ? pct(s.pct, 1, false) : '—'}</span></li>))}</ul>
        : <div className="empty" style={{ padding: '10px 0' }}>{stakes ? 'No 13D/13G filed in the new XML format yet.' : 'Holder filings load with the company file.'}</div>}
      {funds.length > 0 && <>
        <div className="sub" style={{ marginTop: 12 }}>Funds Parallax follows</div>
        <ul className="feed">{funds.slice(0, 8).map(({ fund, h }) => (
          <li key={fund.cik}><span className="ttl">{fund.name}<small>{dateLabel(fund.period)} · {big(h.shares, 1)} sh · ${big(h.value, 1)}</small></span><span className="mono">{pct(h.pct, 1, false)}<small className="faint"> of fund</small></span></li>))}</ul>
      </>}
    </Panel>
  );
}

function StatRow({ label, s }: { label: string; s: SeasonStat }) {
  return <tr><td className="l">{label}</td><td>{s.n}</td><td><b>{isNum(s.beatPct) ? pct(s.beatPct, 0, false) : '—'}</b></td><td className="hs">{isNum(s.medianSurprise) ? <Chg v={s.medianSurprise} dp={1} /> : '—'}</td><td>{s.revN ? pct((s.revBeat / s.revN) * 100, 0, false) : '—'}</td></tr>;
}

export function EarningsSeason() {
  const d = useSource(SEASON);
  const x = d.data;
  const W = 300, H = 90, wk = x?.weeks ?? [], bw = wk.length ? W / wk.length : 0, maxN = Math.max(1, ...wk.map((w) => w.n));
  return (
    <Panel id="p-season" title="Earnings season" src={d} span="c4"
      note={x ? `Reported EPS against the consensus estimate from Finnhub, ${dateLabel(x.from)} – ${dateLabel(x.to)}. “Largest” is the ${x.largeN} biggest US-listed companies by market value. Bars: share of the week’s large-company reports that beat (height = how many reported).` : 'From Finnhub’s earnings calendar.'}>
      {x && <>
        <div className="kpis">
          <div className="kpi"><span>Beat EPS (largest)</span><b><Big>{isNum(x.large.beatPct) ? pct(x.large.beatPct, 0, false) : '—'}</Big></b><small>{x.large.beat} of {x.large.n}</small></div>
          <div className="kpi"><span>Median surprise</span><b><Big>{isNum(x.large.medianSurprise) ? pct(x.large.medianSurprise, 1) : '—'}</Big></b><small>vs estimate</small></div>
          <div className="kpi"><span>Beat revenue</span><b><Big>{x.large.revN ? pct((x.large.revBeat / x.large.revN) * 100, 0, false) : '—'}</Big></b><small>{x.large.revN} reports</small></div>
        </div>
        {wk.length > 0 && <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" style={{ marginTop: 10 }} role="img" aria-label="Weekly beat rate">
          {wk.map((w, i) => { const h = Math.max(2, (w.n / maxN) * H), r = w.n ? w.beat / w.n : 0; return <g key={w.wk}>
            <rect x={i * bw + 2} y={H - h} width={bw - 4} height={h} rx="3" fill={T.lineHi} />
            <rect x={i * bw + 2} y={H - h * r} width={bw - 4} height={h * r} rx="3" fill={T.accent2} opacity=".85"><title>{`Week of ${w.wk}: ${w.beat} of ${w.n} beat`}</title></rect>
            {i % 2 === 0 && <text x={i * bw + bw / 2} y={H + 12} textAnchor="middle" style={{ fill: T.faint, font: '9px var(--sans)' }}>{dateLabel(w.wk, false)}</text>}
          </g>; })}
        </svg>}
        <table className="t" style={{ marginTop: 8 }}><thead><tr><th className="l"></th><th>Reports</th><th>EPS beat</th><th className="hs">Median</th><th>Rev. beat</th></tr></thead>
          <tbody><StatRow label="Largest" s={x.large} /><StatRow label="Everyone" s={x.all} /></tbody></table>
        <div className="sub" style={{ marginTop: 10 }}>Biggest surprises (largest companies)</div>
        <div className="tabrow" style={{ flexWrap: 'wrap', gap: 6 }}>
          {[...x.beats.slice(0, 4), ...x.misses.slice(0, 4)].map((e) => <button key={e.symbol + e.date} className="btn" onClick={() => openCompany(e.symbol)}><b className="mono">{e.symbol}</b> <Chg v={surprisePct(e)} dp={0} /></button>)}
        </div>
      </>}
    </Panel>
  );
}
