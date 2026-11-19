import { useMemo, useState } from 'react';
import { COT, CRYPTO, EARNINGS, edgarSource, IPOS, NEWS, tone } from '@/data/sources';
import { sourceFor, useSource } from '@/data/store';
import { ago, big, dateLabel, isNum, num, pct, price } from '@/lib/format';
import { Chg, Panel, Spark, Tabs, useNow, Big } from '@/ui/kit';
import { T } from '@/ui/theme';

// ---------------------------------------------------------------- CFTC positioning
export function Positioning({ group, id = 'p-cot', span = 'c6', title = 'Speculative positioning (COT)' }: { group?: string; id?: string; span?: 'c6' | 'c12'; title?: string } = {}) {
  const c = useSource(COT);
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof c.data>>();
    for (const r of c.data ?? []) { if (group && r.market.group !== group) continue; if (!m.has(r.market.group)) m.set(r.market.group, []); m.get(r.market.group)!.push(r); }
    return [...m.entries()];
  }, [c.data, group]);
  const date = c.data?.[0]?.date;
  return (
    <Panel id={id} title={title} src={c} span={span}
      note={`CFTC Commitments of Traders, positions as of ${dateLabel(date)} (released the following Friday). Net = leveraged funds for financial futures, managed money for commodities. Percentile = where this week's net sits in the past year.`}>
      <table className="t">
        <thead><tr><th>Market</th><th>Net contracts</th><th className="hs">Weekly chg</th><th className="hs">% of OI</th><th>1Y percentile</th><th>1Y net</th></tr></thead>
        <tbody>
          {groups.map(([g, rows]) => [
            <tr className="grp" key={g}><td colSpan={6}>{g}</td></tr>,
            ...rows.map((r) => (
              <tr key={r.market.code}>
                <td>{r.market.label}</td>
                <td className={r.net > 0 ? 'up' : r.net < 0 ? 'down' : ''}>{r.net > 0 ? 'Long ' : r.net < 0 ? 'Short ' : ''}{num(Math.abs(r.net), 0)}</td>
                <td className="hs"><Chg v={r.change} suffix="" dp={0} /></td>
                <td className="hs">{pct(r.netPctOi, 1)}</td>
                <td>{r.pctile == null ? '—' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="rbar" style={{ width: 54 }}><i style={{ left: `calc(${r.pctile}% - 1px)` }} /></span><span className={r.pctile >= 90 || r.pctile <= 10 ? 'mono' : 'dim'} style={{ minWidth: 26, color: r.pctile >= 90 || r.pctile <= 10 ? T.accent2 : undefined }}>{r.pctile}</span></span>}</td>
                <td><Spark data={r.history} w={70} h={16} base={0} color={T.accent} /></td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------- crypto
export function Crypto() {
  const c = useSource(CRYPTO);
  const d = c.data;
  return (
    <Panel id="p-crypto" title="Crypto" src={c} span="c4" note="Fear & Greed from alternative.me (0 = extreme fear, 100 = extreme greed). Fees in sat/vB.">
      {d && <>
        <div className="kpis">
          <div className="kpi"><span>Total market cap</span><b><Big>{d.totalMcap ? '$' + big(d.totalMcap) : '—'}</Big></b><small><Chg v={d.mcapChg} /> 24h</small></div>
          <div className="kpi"><span>BTC dominance</span><b><Big>{isNum(d.btcDom) ? d.btcDom.toFixed(1) + '%' : '—'}</Big></b><small>ETH {isNum(d.ethDom) ? d.ethDom.toFixed(1) + '%' : '—'}</small></div>
          <div className="kpi"><span>Fear &amp; Greed</span><b><Big>{d.fng ? d.fng.value : '—'}</Big></b><small>{d.fng?.label ?? ''}</small></div>
          <div className="kpi"><span>BTC fees, sat/vB</span><b style={{ fontSize: 14 }}><Big>{d.fees ? `${d.fees.fast}/${d.fees.hour}/${d.fees.eco}` : '—'}</Big></b><small>{d.height ? 'block ' + num(d.height, 0) : ''}</small></div>
        </div>
        <table className="t">
          <thead><tr><th>Asset</th><th>Price</th><th>24h</th><th className="hm">7d</th><th className="hm">Mkt cap</th><th>7 days</th></tr></thead>
          <tbody>
            {d.coins.map((x) => <tr key={x.id}><td>{x.name}<span className="sym">{x.symbol}</span></td><td>{price(x.price)}</td><td><Chg v={x.chg24} /></td><td className="hm"><Chg v={x.chg7d} /></td><td className="hm">{big(x.mcap)}</td><td><Spark data={x.spark.filter((_, i) => i % 3 === 0)} w={64} h={16} /></td></tr>)}
          </tbody>
        </table>
      </>}
    </Panel>
  );
}

// ---------------------------------------------------------------- news
export function News() {
  const n = useSource(NEWS);
  const now = useNow();
  const [src, setSrc] = useState('All');
  const list = (n.data ?? []).filter((h) => src === 'All' || h.source === src);
  const tones = (n.data ?? []).slice(0, 40).map((h) => tone(h.title));
  const pos = tones.filter((t) => t > 0).length, neg = tones.filter((t) => t < 0).length, neu = tones.length - pos - neg;
  const sources = ['All', ...new Set((n.data ?? []).map((h) => h.source))];
  return (
    <Panel id="p-news" title="Headlines" src={n} span="c6" right={<Tabs small value={src} onChange={setSrc} options={sources.map((s) => [s, s] as [string, string])} />}
      note="Headline tone counts positive vs negative words in the 40 latest headlines. It's a rough read of the tape, not a sentiment model.">
      {tones.length > 0 && <>
        <div className="mono dim" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}><span>Headline tone</span><span><span className="up">{pos} positive</span> · {neu} neutral · <span className="down">{neg} negative</span></span></div>
        <div className="tonebar"><i style={{ width: `${(pos / tones.length) * 100}%`, background: T.up }} /><i style={{ width: `${(neu / tones.length) * 100}%`, background: T.lineHi }} /><i style={{ width: `${(neg / tones.length) * 100}%`, background: T.down }} /></div>
      </>}
      <ul className="feed">
        {list.slice(0, 30).map((h) => (
          <li key={h.link + h.title}>
            <span className="meta">{h.when ? ago(h.when, now) : ''}</span>
            <span className="ttl"><a href={h.link} target="_blank" rel="noreferrer noopener">{h.title}</a></span>
            <span className="tag">{h.source}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- SEC filings
const FORMS: [string, string][] = [['8-K', '8-K'], ['4', 'Insider (4)'], ['S-1', 'S-1'], ['SCHEDULE 13D', '13D']];
export function Filings() {
  const [form, setForm] = useState('8-K');
  const def = sourceFor('sec:' + form, () => edgarSource(form));
  const s = useSource(def);
  const now = useNow();
  return (
    <Panel id="p-filings" title="SEC filings" src={s} span="c3" right={<Tabs small value={form} onChange={setForm} options={FORMS} />}
      note="Live EDGAR feed. 8-K = material events, Form 4 = insider trades, S-1 = IPO registrations, 13D = activist stakes over 5%.">
      <ul className="feed">
        {(s.data ?? []).slice(0, 25).map((f) => (
          <li key={f.link}>
            <span className="meta">{ago(Date.parse(f.when), now)}</span>
            <span className="ttl"><a href={f.link} target="_blank" rel="noreferrer noopener">{f.company}</a>{f.items && <small>{f.items}</small>}</span>
            <span className="tag">{f.form}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- earnings & IPOs
export function Calendar() {
  const e = useSource(EARNINGS);
  const i = useSource(IPOS);
  const [tab, setTab] = useState<'next' | 'reported' | 'ipo'>('next');
  const rep = e.data?.reported ?? [];
  const beats = rep.filter((r) => r.epsAct! > r.epsEst!).length;
  const src = tab === 'ipo' ? i : e;
  return (
    <Panel id="p-cal" title="Earnings & IPOs" src={src} span="c3" right={<Tabs small value={tab} onChange={setTab} options={[['next', 'Next 7d'], ['reported', 'Reported'], ['ipo', 'IPOs']]} />}
      note={tab === 'reported' && rep.length ? `${beats} of ${rep.length} companies (${Math.round((beats / rep.length) * 100)}%) beat EPS estimates in the past 7 days.` : 'From Finnhub. bmo = before open, amc = after close.'}>
      {tab === 'next' && <table className="t long"><thead><tr><th>Symbol</th><th>Date</th><th>When</th><th>EPS est.</th></tr></thead><tbody>
        {(e.data?.upcoming ?? []).slice(0, 40).map((x) => <tr key={x.symbol + x.date}><td><b className="mono">{x.symbol}</b></td><td className="dim">{dateLabel(x.date, false)}</td><td className="dim">{x.hour || '—'}</td><td>{isNum(x.epsEst) ? x.epsEst.toFixed(2) : '—'}</td></tr>)}
      </tbody></table>}
      {tab === 'reported' && <table className="t long"><thead><tr><th>Symbol</th><th>Date</th><th>EPS</th><th>Est.</th><th>Surprise</th></tr></thead><tbody>
        {rep.slice(0, 40).map((x) => { const s = x.epsEst ? ((x.epsAct! - x.epsEst) / Math.abs(x.epsEst)) * 100 : null; return <tr key={x.symbol + x.date}><td><b className="mono">{x.symbol}</b></td><td className="dim">{dateLabel(x.date, false)}</td><td>{x.epsAct!.toFixed(2)}</td><td className="dim">{x.epsEst!.toFixed(2)}</td><td><Chg v={s} dp={1} /></td></tr>; })}
      </tbody></table>}
      {tab === 'ipo' && <table className="t"><thead><tr><th>Company</th><th>Date</th><th>Price</th><th>Status</th></tr></thead><tbody>
        {(i.data ?? []).slice(0, 30).map((x) => <tr key={x.name + x.date}><td>{x.name}{x.symbol && <span className="sym">{x.symbol}</span>}</td><td className="dim">{dateLabel(x.date, false)}</td><td>{x.price || '—'}</td><td className="dim">{x.status}</td></tr>)}
      </tbody></table>}
    </Panel>
  );
}
