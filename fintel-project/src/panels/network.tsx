import { useMemo, useState } from 'react';
import { NETWORK, type Network } from '@/data/company';
import { useSource } from '@/data/store';
import { useQuotes } from '@/data/yahoo';
import { Panel, Tabs } from '@/ui/kit';
import { heat, T } from '@/ui/theme';

// Link analysis: companies and the people (officers, directors, 10% owners) who connect them, from Form 4.

interface N { id: string; kind: 'co' | 'person' | 'fund' | '13D'; label: string; x: number; y: number; vx: number; vy: number; r: number }
interface E { a: number; b: number; role: string }

/** Deterministic force layout (no animation): repulsion, springs on edges, gentle pull to centre. */
export function layout(nodes: N[], edges: E[], W: number, H: number, iters = 260) {
  const k = Math.sqrt((W * H) / Math.max(1, nodes.length)) * 0.55;
  nodes.forEach((n, i) => { const a = (i / nodes.length) * Math.PI * 2; n.x = W / 2 + Math.cos(a) * W * 0.35; n.y = H / 2 + Math.sin(a) * H * 0.35; });
  for (let it = 0; it < iters; it++) {
    const t = 1 - it / iters;
    for (const n of nodes) { n.vx = 0; n.vy = 0; }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y; const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      if (d > 3 * k) continue; // only nearby nodes push each other apart
      const f = (k * k) / d; dx /= d; dy /= d; // Fruchterman–Reingold repulsion k²/d
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, f = (d * d) / k / d;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const n of nodes) {
      n.vx += (W / 2 - 50 - n.x) * 0.5; n.vy += (H / 2 - n.y) * 0.8; // pull toward the centre so separate clusters stay in view
      const v = Math.sqrt(n.vx * n.vx + n.vy * n.vy) || 1, step = Math.min(v, 40 * t + 0.5);
      n.x = Math.max(n.r + 10, Math.min(W - n.r - 110, n.x + (n.vx / v) * step)); // room for labels on the right
      n.y = Math.max(n.r + 10, Math.min(H - n.r - 10, n.y + (n.vy / v) * step));
    }
  }
}

type Mode = 'links' | 'holders' | 'all';
function graphFor(net: Network, mode: Mode, focus: string | null) {
  if (mode === 'holders') return holderGraph(net, focus);
  const people = net.people.filter((p) => (mode === 'all' ? true : p.links.length > 1) && (!focus || p.links.some((l) => l.ticker === focus)));
  const tickers = new Set(people.flatMap((p) => p.links.map((l) => l.ticker)));
  if (focus) tickers.add(focus);
  const nodes: N[] = [], idx = new Map<string, number>();
  for (const c of net.companies.filter((c) => tickers.has(c.ticker))) { idx.set('c:' + c.ticker, nodes.length); nodes.push({ id: 'c:' + c.ticker, kind: 'co', label: c.ticker, x: 0, y: 0, vx: 0, vy: 0, r: 15 }); }
  for (const p of people) { idx.set('p:' + p.cik, nodes.length); nodes.push({ id: 'p:' + p.cik, kind: 'person', label: p.name, x: 0, y: 0, vx: 0, vy: 0, r: p.links.length > 1 ? 5 : 3.5 }); }
  const edges: E[] = [];
  for (const p of people) for (const l of p.links) { const a = idx.get('p:' + p.cik), b = idx.get('c:' + l.ticker); if (a != null && b != null) edges.push({ a, b, role: l.role }); }
  return { nodes, edges, people };
}
/** Funds (13F) and 13D filers linked to the companies they own; a fund's smallest positions (<1% of it) are left out. */
function holderGraph(net: Network, focus: string | null) {
  const hs = (net.holders ?? []).map((h) => ({ ...h, links: h.links.filter((l) => h.kind === '13D' || (l.pct ?? 0) >= 1) }))
    .filter((h) => h.links.length && (!focus || h.links.some((l) => l.ticker === focus)));
  const tickers = new Set(hs.flatMap((h) => h.links.map((l) => l.ticker)));
  if (focus) tickers.add(focus);
  const nodes: N[] = [], idx = new Map<string, number>();
  for (const c of net.companies.filter((c) => tickers.has(c.ticker))) { idx.set('c:' + c.ticker, nodes.length); nodes.push({ id: 'c:' + c.ticker, kind: 'co', label: c.ticker, x: 0, y: 0, vx: 0, vy: 0, r: 15 }); }
  for (const h of hs) { idx.set(h.id, nodes.length); nodes.push({ id: h.id, kind: h.kind, label: h.name, x: 0, y: 0, vx: 0, vy: 0, r: h.kind === 'fund' ? 7 : 5 }); }
  const edges: E[] = [];
  for (const h of hs) for (const l of h.links) { const a = idx.get(h.id), b = idx.get('c:' + l.ticker); if (a != null && b != null) edges.push({ a, b, role: l.pct != null ? `${l.pct.toFixed(1)}%` : '' }); }
  return { nodes, edges, people: [] as Network['people'], holders: hs };
}

export function LinkView({ onOpen }: { onOpen: (t: string) => void }) {
  const net = useSource(NETWORK);
  const [mode, setMode] = useState<Mode>('links');
  const [focus, setFocus] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const q = useQuotes(net.data?.companies.map((c) => c.ticker) ?? []);
  const W = 900, H = 520;
  const g = useMemo(() => {
    if (!net.data) return null;
    const r = graphFor(net.data, mode, focus);
    layout(r.nodes, r.edges, W, H, r.nodes.length > 250 ? 120 : 260);
    return r;
  }, [net.data, mode, focus]);
  const selNode = g?.nodes.find((n) => n.id === sel);
  const selPerson = sel?.startsWith('p:') ? g?.people.find((p) => 'p:' + p.cik === sel) : undefined;
  const selHolder = sel && /^[fd]:/.test(sel) ? net.data?.holders?.find((h) => h.id === sel) : undefined;
  const nb = new Set<string>();
  if (sel && g) for (const e of g.edges) { const a = g.nodes[e.a].id, b = g.nodes[e.b].id; if (a === sel) nb.add(b); if (b === sel) nb.add(a); }
  const interlocks = net.data?.people.filter((p) => p.links.length > 1).length ?? 0;
  return (
    <Panel id="p-link" title={mode === 'holders' ? 'Link analysis · funds and activists' : 'Link analysis · insider network'} src={net} span="c12"
      right={<>
        {focus && <button className="btn" onClick={() => setFocus(null)}>✕ {focus}</button>}
        <Tabs small value={mode} onChange={(m) => { setMode(m); setSel(null); }} options={[['links', 'Shared insiders'], ['holders', 'Funds & activists'], ['all', 'Everyone']]} />
      </>}
      note={net.data ? `${net.data.companies.length} companies · ${net.data.people.length} officers, directors and 10% owners from recent Form 4 filings · ${interlocks} sit at two or more. Funds & activists: ${net.data.holders?.filter((h) => h.kind === 'fund').length ?? 0} well-known funds’ latest 13F positions of 1% or more of the fund, and 13D filers (5%+ holders who may seek to influence the company). Click a company to focus it, double-click to open its page.` : 'Built daily from SEC Form 4, 13F and 13D filings.'}>
      {g && (
        <div className="net">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Network graph" onClick={() => setSel(null)}>
            {g.edges.map((e, i) => {
              const a = g.nodes[e.a], b = g.nodes[e.b], on = sel && (a.id === sel || b.id === sel);
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? T.accent : T.lineHi} strokeWidth={on ? 1.6 : 0.8} opacity={sel && !on ? 0.25 : 0.9} />;
            })}
            {g.nodes.map((n) => {
              const dim = sel && n.id !== sel && !nb.has(n.id);
              if (n.kind === 'co') {
                const t = n.label, ch = q.data?.[t]?.changePct;
                return <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer' }} opacity={dim ? 0.3 : 1}
                  onClick={(e) => { e.stopPropagation(); setSel(n.id); }} onDoubleClick={() => onOpen(t)}>
                  <circle r={n.r} fill={heat(ch ?? null, 3)} stroke={n.id === sel ? '#fff' : T.lineHi} strokeWidth={n.id === sel ? 2 : 1} />
                  <text textAnchor="middle" y="3.5" style={{ fill: '#fff', font: '700 9px var(--mono)' }}>{t}</text>
                </g>;
              }
              if (n.kind === 'fund' || n.kind === '13D') return <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer' }} opacity={dim ? 0.25 : 1} onClick={(e) => { e.stopPropagation(); setSel(n.id); }}>
                {n.kind === 'fund' ? <rect x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} rx="2" fill={T.accent2} /> : <path d={`M0 ${-n.r - 1} L${n.r + 1} ${n.r} L${-n.r - 1} ${n.r}Z`} fill={T.text} />}
                <text x={n.r + 3} y="3" style={{ fill: T.text, font: '10px var(--sans)' }}>{n.label}</text>
              </g>;
              const multi = n.r > 4;
              return <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer' }} opacity={dim ? 0.25 : 1} onClick={(e) => { e.stopPropagation(); setSel(n.id); }}>
                <circle r={n.r} fill={multi ? T.accent2 : T.dim} />
                {(multi && mode === 'links') || n.id === sel ? <text x={n.r + 3} y="3" style={{ fill: T.text, font: '10px var(--sans)' }}>{n.label}</text> : null}
              </g>;
            })}
          </svg>
          <aside className="net-side">
            {!selNode && <p className="dim" style={{ fontSize: 12 }}>{mode === 'holders' ? 'Select a node. Blue squares are funds (13F), white triangles are 13D filers. Lines show what each owns.' : 'Select a node. Blue dots are people who are insiders at more than one company here, a classic sign of board interlocks.'}</p>}
            {selNode?.kind === 'co' && (() => {
              const t = selNode.label, c = net.data!.companies.find((x) => x.ticker === t);
              const ppl = net.data!.people.filter((p) => p.links.some((l) => l.ticker === t));
              const own = (net.data!.holders ?? []).filter((h) => h.links.some((l) => l.ticker === t));
              return <>
                <h3>{c?.name ?? t}</h3><p className="dim" style={{ fontSize: 11.5 }}>{c?.industry}</p>
                <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}><button className="btn pri" onClick={() => onOpen(t)}>Open {t}</button><button className="btn" onClick={() => setFocus(t)}>Focus</button></div>
                {own.length > 0 && <ul className="feed" style={{ marginBottom: 8 }}>{own.map((h) => <li key={h.id}><span className="ttl">{h.name}<small>{h.kind === 'fund' ? '13F fund' : '13D filer'}</small></span><span className="mono">{h.links.find((l) => l.ticker === t)?.pct?.toFixed(1) ?? '—'}%</span></li>)}</ul>}
                <ul className="feed">{ppl.slice(0, 30).map((p) => <li key={p.cik}><span className="ttl">{p.name}<small>{p.links.find((l) => l.ticker === t)?.role}{p.links.length > 1 ? ` · also ${p.links.filter((l) => l.ticker !== t).map((l) => l.ticker).join(', ')}` : ''}</small></span></li>)}</ul>
              </>;
            })()}
            {selHolder && <>
              <h3>{selHolder.name}</h3><p className="dim" style={{ fontSize: 11.5 }}>{selHolder.kind === 'fund' ? 'Latest 13F · % of the fund’s reported portfolio' : 'Schedule 13D · % of the company'}</p>
              <ul className="feed">{[...selHolder.links].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).map((l) => <li key={l.ticker}><span className="ttl"><button className="link" onClick={() => onOpen(l.ticker)}>{l.ticker}</button></span><span className="mono">{l.pct != null ? l.pct.toFixed(1) + '%' : '—'}</span></li>)}</ul>
            </>}
            {selPerson && <>
              <h3>{selPerson.name}</h3>
              <ul className="feed">{selPerson.links.map((l) => <li key={l.ticker}><span className="ttl"><button className="link" onClick={() => onOpen(l.ticker)}>{l.ticker}</button><small>{l.role}</small></span></li>)}</ul>
            </>}
          </aside>
        </div>
      )}
      {!g && net.status === 'error' && <div className="empty">The network is built by the snapshot job (npm run snapshot). {net.error}</div>}
    </Panel>
  );
}
