import { useMemo, useState } from 'react';
import { useSource } from '@/data/store';
import { useQuotes } from '@/data/yahoo';
import { CURVES, HISTORY, INVENTORIES, INV_DEFS, changeCorr, curveStats, fiveYear, pair, pctile } from '@/data/commodities';
import { dateLabel, isNum, num, pct } from '@/lib/format';
import { CurveChart } from '@/ui/charts';
import { Big, Chg, Panel, Tabs } from '@/ui/kit';
import { T } from '@/ui/theme';

// The Commodities tab: futures curves and their shape, EIA inventories against the 5-year range, gold against real
// yields and the dollar, metal ratios, plus a strip for Overview. Data: src/data/commodities.ts.

const SHAPE: Record<string, string> = { contango: 'Contango', backwardation: 'Backwardation', flat: 'Flat' };
const shapeTip = (s: string) => s === 'contango' ? 'Later months cost more than the front month: supply is ample now (storage is paid for).' : s === 'backwardation' ? 'The front month costs more than later months: supply is tight right now.' : 'Front and 12-month prices are within 0.5%.';
const fmt = (v: number, dp: number) => (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(dp));
const ShapeTag = ({ s }: { s: string }) => <span className={'shape ' + s} title={shapeTip(s)}>{SHAPE[s]}</span>;

// ---------------------------------------------------------------- Overview strip
const STRIP: [string, string, string][] = [['CL=F', 'WTI crude', 'cl'], ['BZ=F', 'Brent', 'bz'], ['NG=F', 'Natural gas', 'ng'], ['GC=F', 'Gold', 'gc'], ['SI=F', 'Silver', 'si'], ['HG=F', 'Copper', 'hg']];
export function CommodityStrip() {
  const q = useQuotes(STRIP.map((x) => x[0]));
  const c = useSource(CURVES);
  const shape = (k: string) => { const cv = c.data?.curves.find((x) => x.key === k); return cv ? curveStats(cv).shape : null; };
  return (
    <Panel id="p-cstrip" title="Commodities" src={q} span="c12" hasData={!!q.data}
      right={<a className="btn" href="#/w/commodities">Open the Commodities tab</a>}
      note="Front-month futures (Yahoo Finance). The tag is the shape of each futures curve, from the Commodities tab: contango when later months cost more, backwardation when the front month does.">
      <div className="cstrip">
        {STRIP.map(([sym, label, k]) => { const x = q.data?.[sym], s = shape(k); return (
          <a key={sym} className="ctile" href="#/w/commodities">
            <span className="lbl">{label}</span>
            <b><Big>{isNum(x?.price) ? fmt(x!.price, k === 'ng' || k === 'hg' ? 3 : 2) : '—'}</Big></b>
            <span className="row"><Chg v={x?.changePct} />{s && <ShapeTag s={s} />}</span>
          </a>); })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- futures curves
export function FuturesCurves() {
  const c = useSource(CURVES);
  const [k, setK] = useState('cl');
  const cv = c.data?.curves.find((x) => x.key === k) ?? c.data?.curves[0];
  const st = cv ? curveStats(cv) : null;
  const opts = (c.data?.curves ?? []).map((x) => [x.key, x.label.replace(' (RBOB)', '')] as [string, string]);
  return (
    <Panel id="p-curves" title="Futures curves" src={c} span="c8"
      right={opts.length ? <Tabs small value={cv?.key ?? k} options={opts} onChange={setK} /> : undefined}
      note="Settlement prices for each contract month, from Yahoo Finance (CME, NYMEX and COMEX contracts): energy every month for two years, metals their active delivery months. The dashed line is the same curve a week ago (five sessions back). Contango: later months cost more than the front, usually when supply is ample and storage is being paid for. Backwardation: the front month costs more, usually when supply is tight now. Months that haven't settled in the last few days are left out.">
      {cv && st && <>
        <div className="kpis">
          <div className="kpi"><span>Front month · {cv.pts[0].label}</span><b><Big>{fmt(cv.pts[0].px, cv.dp)}</Big></b><small>{cv.unit} · <Chg v={st.frontChg} /> 1w</small></div>
          <div className="kpi"><span>12 months out · {st.far?.label}</span><b><Big>{st.far ? fmt(st.far.px, cv.dp) : '—'}</Big></b><small>{cv.unit}</small></div>
          <div className="kpi"><span>12-month spread</span><b><Big>{isNum(st.spread) ? pct(st.spread, 1) : '—'}</Big></b><small><ShapeTag s={st.shape} /></small></div>
        </div>
        <CurveChart labels={cv.pts.map((p) => p.label)} h={230} fmt={(n) => fmt(n, cv.dp)}
          series={[{ name: 'Week ago', color: '#6f6f6f', values: cv.pts.map((p) => p.wk), dash: '5 5' }, { name: 'Now', color: T.accent, values: cv.pts.map((p) => p.px) }]} />
        <p className="faint" style={{ fontSize: 11.5, marginTop: 6 }}><span style={{ color: T.accent }}>━</span> now &nbsp; <span style={{ color: '#8a8a8a' }}>┅</span> a week ago &nbsp;·&nbsp; {cv.pts.length} contracts</p>
      </>}
    </Panel>
  );
}

export function TermStructure() {
  const c = useSource(CURVES);
  const rows = useMemo(() => (c.data?.curves ?? []).map((cv) => ({ cv, st: curveStats(cv) })), [c.data]);
  return (
    <Panel id="p-term" title="Curve shape" src={c} span="c4"
      note="For each futures curve: the front month, the contract about 12 months later and the spread between them. Contango (later months dearer) points to ample supply; backwardation (front month dearer) to tight supply right now.">
      <table className="t">
        <thead><tr><th className="l">Market</th><th>Front</th><th>+12m</th><th>Spread</th></tr></thead>
        <tbody>{rows.map(({ cv, st }) => (
          <tr key={cv.key}><td className="l">{cv.label.replace(' (RBOB)', '')}<br /><ShapeTag s={st.shape} /></td>
            <td>{fmt(cv.pts[0].px, cv.dp)}</td><td>{st.far ? fmt(st.far.px, cv.dp) : '—'}</td>
            <td><Chg v={st.spread} dp={1} /></td></tr>))}</tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------- EIA inventories vs the 5-year range
const MONTH_W = [1, 5, 9, 14, 18, 22, 27, 31, 36, 40, 44, 49];
function BandChart({ band, cur, prev, unit }: { band: { w: number; min: number; max: number; avg: number }[]; cur: { w: number; v: number }[]; prev: { w: number; v: number }[]; unit: string }) {
  const W = 720, H = 230, L = 6, R = 58, Tp = 12, B = 22;
  const all = [...band.flatMap((b) => [b.min, b.max]), ...cur.map((c) => c.v), ...prev.map((p) => p.v)];
  let min = Math.min(...all), max = Math.max(...all); const pad = (max - min) * 0.08 || 1; min -= pad; max += pad;
  const x = (w: number) => L + ((w - 1) / 51) * (W - L - R), y = (v: number) => Tp + (1 - (v - min) / (max - min)) * (H - Tp - B);
  const line = (pts: { w: number; v: number }[]) => pts.map((p, i) => (i ? 'L' : 'M') + x(p.w).toFixed(1) + ',' + y(p.v).toFixed(1)).join('');
  const area = band.map((b, i) => (i ? 'L' : 'M') + x(b.w).toFixed(1) + ',' + y(b.max).toFixed(1)).join('') + [...band].reverse().map((b) => 'L' + x(b.w).toFixed(1) + ',' + y(b.min).toFixed(1)).join('') + 'Z';
  const step = (max - min) / 4, ticks = [0, 1, 2, 3, 4].map((i) => min + step * i);
  const lastC = cur[cur.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Inventories against the 5-year range">
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={T.grid} strokeDasharray="4 5" /><text x={W - R + 8} y={y(t) + 3}>{num(t, t >= 100 ? 0 : 1)}</text></g>)}
      {MONTH_W.map((w, i) => <text key={w} x={x(w)} y={H - 6} textAnchor={i === 0 ? 'start' : 'middle'}>{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}</text>)}
      <path d={area} fill="#ffffff" opacity="0.07" />
      <path d={line(band.map((b) => ({ w: b.w, v: b.avg })))} fill="none" stroke="#9b9b9b" strokeWidth="1" strokeDasharray="4 4" />
      <path d={line(prev)} fill="none" stroke="#6a6a6a" strokeWidth="1.1" />
      <path d={line(cur)} fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinejoin="round" />
      {lastC && <><circle cx={x(lastC.w)} cy={y(lastC.v)} r="3.6" fill={T.accent2} /><text x={Math.min(x(lastC.w) + 8, W - R - 70)} y={y(lastC.v) - 8} style={{ fill: T.text }}>{num(lastC.v, lastC.v >= 100 ? 0 : 1)} {unit}</text></>}
    </svg>
  );
}
export function Inventories() {
  const d = useSource(INVENTORIES);
  const [k, setK] = useState('crude');
  const def = INV_DEFS.find((x) => x.key === k)!;
  const f = useMemo(() => (d.data?.[k] ? fiveYear(d.data[k]) : null), [d.data, k]);
  const u = def.unit, dp = u === 'Bcf' ? 0 : 1;
  return (
    <Panel id="p-inv" title="Energy inventories" src={d} span="c8"
      right={<Tabs small value={k} options={INV_DEFS.map((x) => [x.key, x.label] as [string, string])} onChange={setK} />}
      note={`EIA weekly data: ${def.what}. The shaded band is the range for the same week over the previous five years, the dashed line its average, the grey line last year. Petroleum stocks are released on Wednesdays (week ending the previous Friday), natural gas storage on Thursdays. Above the 5-year average usually weighs on prices; below it supports them.`}>
      {f && <>
        <div className="kpis">
          <div className="kpi"><span>Latest · {dateLabel(f.last.d)}</span><b><Big>{num(f.last.v, dp)}</Big></b><small>{u}</small></div>
          <div className="kpi"><span>Weekly change</span><b><Big>{isNum(f.weekly) ? (f.weekly > 0 ? '+' : '') + num(f.weekly, dp) : '—'}</Big></b><small>{u}</small></div>
          <div className="kpi"><span>vs 5-year average</span><b><Big>{isNum(f.vsAvgPct) ? pct(f.vsAvgPct, 1) : '—'}</Big></b><small>{isNum(f.vsAvg) ? (f.vsAvg > 0 ? '+' : '') + num(f.vsAvg, dp) + ' ' + u : ''}</small></div>
          <div className="kpi"><span>vs a year ago</span><b><Big>{isNum(f.yoy) ? (f.yoy > 0 ? '+' : '') + num(f.yoy, dp) : '—'}</Big></b><small>{u}</small></div>
        </div>
        <BandChart band={f.band} cur={f.cur} prev={f.prev} unit={u} />
        <p className="faint" style={{ fontSize: 11.5, marginTop: 6 }}><span style={{ color: T.accent }}>━</span> {f.year} &nbsp; <span style={{ color: '#7a7a7a' }}>━</span> {f.year - 1} &nbsp; <span style={{ color: '#9b9b9b' }}>┅</span> 5-year average &nbsp; <span style={{ opacity: .6 }}>▇</span> 5-year range ({f.year - 5}–{f.year - 1})</p>
      </>}
    </Panel>
  );
}

// ---------------------------------------------------------------- gold vs real yields and the dollar
function DualChart({ p, invertB, colorB, fmtA, fmtB }: { p: { d: string; a: number; b: number }[]; invertB?: boolean; colorB: string; fmtA: (n: number) => string; fmtB: (n: number) => string }) {
  const W = 720, H = 230, L = 52, R = 52, Tp = 12, B = 22;
  if (p.length < 10) return null;
  const ra = [Math.min(...p.map((o) => o.a)), Math.max(...p.map((o) => o.a))], rb = [Math.min(...p.map((o) => o.b)), Math.max(...p.map((o) => o.b))];
  const x = (i: number) => L + (i / (p.length - 1)) * (W - L - R);
  const ya = (v: number) => Tp + (1 - (v - ra[0]) / (ra[1] - ra[0] || 1)) * (H - Tp - B);
  const yb = (v: number) => { const k = (v - rb[0]) / (rb[1] - rb[0] || 1); return Tp + (invertB ? k : 1 - k) * (H - Tp - B); };
  const path = (f: (o: { a: number; b: number }) => number) => p.map((o, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + f(o).toFixed(1)).join('');
  const yrs = p.map((o, i) => ({ y: o.d.slice(0, 4), i })).filter((o, i, a) => i === 0 || o.y !== a[i - 1].y).filter((_, i) => i % 2 === 0);
  const ticksA = [0, 1, 2, 3].map((i) => ra[0] + ((ra[1] - ra[0]) * i) / 3), ticksB = [0, 1, 2, 3].map((i) => rb[0] + ((rb[1] - rb[0]) * i) / 3);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Two series over time">
      {ticksA.map((t) => <g key={'a' + t}><line x1={L} x2={W - R} y1={ya(t)} y2={ya(t)} stroke={T.grid} strokeDasharray="4 5" /><text x={L - 6} y={ya(t) + 3} textAnchor="end">{fmtA(t)}</text></g>)}
      {ticksB.map((t) => <text key={'b' + t} x={W - R + 6} y={yb(t) + 3} style={{ fill: colorB }}>{fmtB(t)}</text>)}
      {yrs.map((o) => <text key={o.y} x={x(o.i)} y={H - 6} textAnchor="middle">{o.y}</text>)}
      <path d={path((o) => yb(o.b))} fill="none" stroke={colorB} strokeWidth="1.2" opacity="0.9" />
      <path d={path((o) => ya(o.a))} fill="none" stroke={T.accent} strokeWidth="1.5" />
    </svg>
  );
}
export function GoldRealYields() {
  const h = useSource(HISTORY);
  const [vs, setVs] = useState<'real' | 'usd'>('real');
  const p = useMemo(() => (h.data ? pair(h.data.px.gold, vs === 'real' ? h.data.real : h.data.usd) : []), [h.data, vs]);
  const corr = useMemo(() => changeCorr(p), [p]);
  const last = p[p.length - 1], yr = p[p.length - 53];
  return (
    <Panel id="p-goldry" title={vs === 'real' ? 'Gold vs real yields' : 'Gold vs the dollar'} src={h} span="c6"
      right={<Tabs small value={vs} options={[['real', 'Real yield'], ['usd', 'Dollar']]} onChange={setVs} />}
      note="Weekly, ten years. Gold: COMEX front-month futures (Yahoo Finance). Real yield: 10-year Treasury inflation-indexed yield (FRED DFII10), drawn on an inverted scale so the two lines move together when the usual relationship holds (higher real yields make non-yielding gold less attractive). Dollar: Fed broad trade-weighted dollar index (FRED DTWEXBGS), also inverted. Correlation: weekly gold returns against weekly changes in the other series over the last two years; negative is the textbook relationship.">
      {last && <>
        <div className="kpis">
          <div className="kpi"><span>Gold</span><b><Big>{'$' + num(last.a, 0)}</Big></b><small>{yr ? <Chg v={(last.a / yr.a - 1) * 100} dp={1} /> : null} 1y</small></div>
          <div className="kpi"><span>{vs === 'real' ? '10Y real yield' : 'Broad dollar'}</span><b><Big>{vs === 'real' ? num(last.b, 2) + '%' : num(last.b, 1)}</Big></b><small>{yr ? (vs === 'real' ? (last.b - yr.b > 0 ? '+' : '') + Math.round((last.b - yr.b) * 100) + 'bp' : pct((last.b / yr.b - 1) * 100, 1)) : ''} 1y</small></div>
          <div className="kpi"><span>2-year correlation</span><b><Big>{isNum(corr) ? corr.toFixed(2) : '—'}</Big></b><small>weekly changes</small></div>
        </div>
        <DualChart p={p} invertB colorB={T.accent2} fmtA={(n) => '$' + num(n, 0)} fmtB={(n) => (vs === 'real' ? n.toFixed(1) + '%' : n.toFixed(0))} />
        <p className="faint" style={{ fontSize: 11.5, marginTop: 6 }}><span style={{ color: T.accent }}>━</span> gold (left) &nbsp; <span style={{ color: T.accent2 }}>━</span> {vs === 'real' ? 'real yield' : 'dollar'} (right, inverted)</p>
      </>}
    </Panel>
  );
}

// ---------------------------------------------------------------- metal ratios
function RatioChart({ s }: { s: { d: string; v: number }[] }) {
  const W = 720, H = 200, L = 6, R = 52, Tp = 12, B = 22;
  if (s.length < 10) return null;
  const vs = s.map((o) => o.v), min = Math.min(...vs), max = Math.max(...vs), avg = vs.reduce((a, b) => a + b, 0) / vs.length;
  const x = (i: number) => L + (i / (s.length - 1)) * (W - L - R), y = (v: number) => Tp + (1 - (v - min) / (max - min || 1)) * (H - Tp - B);
  const yrs = s.map((o, i) => ({ y: o.d.slice(0, 4), i })).filter((o, i, a) => i === 0 || o.y !== a[i - 1].y).filter((_, i) => i % 2 === 0);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Ratio over time">
      {[min, (min + max) / 2, max].map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={T.grid} strokeDasharray="4 5" /><text x={W - R + 8} y={y(t) + 3}>{t.toFixed(t < 10 ? 2 : 0)}</text></g>)}
      <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke="#9b9b9b" strokeDasharray="7 6" />
      {yrs.map((o) => <text key={o.y} x={x(o.i)} y={H - 6} textAnchor="middle">{o.y}</text>)}
      <path d={s.map((o, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(o.v).toFixed(1)).join('')} fill="none" stroke={T.accent} strokeWidth="1.4" />
      <circle cx={x(s.length - 1)} cy={y(vs[vs.length - 1])} r="3.6" fill={T.accent2} />
    </svg>
  );
}
export function MetalRatios() {
  const h = useSource(HISTORY);
  const [k, setK] = useState<'gs' | 'cg' | 'og'>('gs');
  const s = useMemo(() => {
    if (!h.data) return [];
    const { gold, silver, copper, wti } = h.data.px;
    if (k === 'gs') return pair(gold, silver).map((o) => ({ d: o.d, v: o.a / o.b }));
    if (k === 'cg') return pair(copper, gold).map((o) => ({ d: o.d, v: (o.a / o.b) * 1000 }));
    return pair(gold, wti).map((o) => ({ d: o.d, v: o.a / o.b }));
  }, [h.data, k]);
  const vs = s.map((o) => o.v), last = vs[vs.length - 1], p = pctile(vs), avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  const what = k === 'gs' ? 'Ounces of silver one ounce of gold buys. High readings usually come with stress (gold outperforms); low ones with strong industrial demand.' : k === 'cg' ? 'Copper ($/lb) over gold ($/oz) × 1000. Copper tracks growth and gold tracks fear, so the ratio rises with growth expectations and tends to move with Treasury yields.' : 'Barrels of WTI one ounce of gold buys: high when oil is cheap relative to gold.';
  return (
    <Panel id="p-ratios" title="Metal ratios" src={h} span="c6"
      right={<Tabs small value={k} options={[['gs', 'Gold / silver'], ['cg', 'Copper / gold'], ['og', 'Gold / oil']]} onChange={setK} />}
      note={`Weekly, ten years, from front-month futures (Yahoo Finance). ${what} The dashed line is the ten-year average; percentile is where today sits in that range.`}>
      {isNum(last) && <>
        <div className="kpis">
          <div className="kpi"><span>Now</span><b><Big>{last.toFixed(k === 'cg' ? 2 : 1)}</Big></b></div>
          <div className="kpi"><span>10-year average</span><b><Big>{isNum(avg) ? avg.toFixed(k === 'cg' ? 2 : 1) : '—'}</Big></b></div>
          <div className="kpi"><span>10-year percentile</span><b><Big>{isNum(p) ? Math.round(p) + 'th' : '—'}</Big></b></div>
        </div>
        <RatioChart s={s} />
      </>}
    </Panel>
  );
}

