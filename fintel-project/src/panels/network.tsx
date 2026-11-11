import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { NETWORK, type Network } from '@/data/company';
import { useSource } from '@/data/store';
import { Panel, Tabs } from '@/ui/kit';

// Link analysis. "Shared insiders": companies joined when the same officer, director or 10% owner files Form 4 at
// both (one line per pair, thicker for more people). "Funds & activists": funds (13F) and 13D filers linked to what
// they own. "Everyone": every Form 4 filer and their companies. Laid out once with d3-force (collision keeps
// labels apart), then drawn as static SVG with hover/selection highlighting and wheel zoom.

type Mode = 'links' | 'holders' | 'all';
type Kind = 'co' | 'person' | 'fund' | '13D';
interface GN extends SimulationNodeDatum { id: string; kind: Kind; label: string; r: number; deg: number; lw: number }
interface GE extends SimulationLinkDatum<GN> { source: string | GN; target: string | GN; w: number; who: string[] }
interface Graph { nodes: GN[]; edges: GE[] }

const W = 1000, H = 640;
const labelW = (s: string, px: number) => s.length * px * 0.56; // Outfit is narrow; close enough for spacing
const cId = (t: string) => 'c:' + t;

/** Companies that share at least one insider, one edge per pair. */
function insiderGraph(net: Network, focus: string | null): Graph {
  const pairs = new Map<string, GE>();
  for (const p of net.people) {
    const ts = [...new Set(p.links.map((l) => l.ticker))].sort();
    if (ts.length < 2) continue;
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      if (focus && ts[i] !== focus && ts[j] !== focus) continue;
      const k = ts[i] + '|' + ts[j], e = pairs.get(k) ?? { source: cId(ts[i]), target: cId(ts[j]), w: 0, who: [] };
      e.w++; e.who.push(p.name); pairs.set(k, e);
    }
  }
  const deg = new Map<string, number>();
  for (const e of pairs.values()) for (const id of [e.source as string, e.target as string]) deg.set(id, (deg.get(id) ?? 0) + 1);
  if (focus && !deg.has(cId(focus))) deg.set(cId(focus), 0);
  const nodes: GN[] = [...deg.entries()].map(([id, d]) => ({ id, kind: 'co', label: id.slice(2), deg: d, r: 4 + Math.sqrt(d) * 2.6, lw: labelW(id.slice(2), 10.5) }));
  return { nodes, edges: [...pairs.values()] };
}
/** Funds (13F positions ≥2% of the fund) and 13D filers, linked to companies. */
function holderGraph(net: Network, focus: string | null): Graph {
  const hs = (net.holders ?? []).map((h) => ({ ...h, links: h.links.filter((l) => h.kind === '13D' || (l.pct ?? 0) >= 2) }))
    .filter((h) => h.links.length && (!focus || h.links.some((l) => l.ticker === focus)));
  const deg = new Map<string, number>(), edges: GE[] = [];
  for (const h of hs) for (const l of h.links) { edges.push({ source: h.id, target: cId(l.ticker), w: Math.max(1, (l.pct ?? 2) / 4), who: [`${h.name}: ${l.pct != null ? l.pct.toFixed(1) + '%' : ''}`] }); deg.set(cId(l.ticker), (deg.get(cId(l.ticker)) ?? 0) + 1); }
  const known = new Set(net.companies.map((c) => cId(c.ticker)));
  const nodes: GN[] = [
    ...[...deg.entries()].filter(([id]) => known.has(id)).map(([id, d]): GN => ({ id, kind: 'co', label: id.slice(2), deg: d, r: 3.5 + Math.sqrt(d) * 2.2, lw: labelW(id.slice(2), 10) })),
    ...hs.map((h): GN => ({ id: h.id, kind: h.kind, label: h.name, deg: h.links.length, r: h.kind === 'fund' ? 6 : 5, lw: labelW(h.name, 11) + 18 })),
  ];
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: edges.filter((e) => ids.has(e.target as string)) };
}
/** Every filer and their companies (dense; people are drawn as small dots without labels). */
function everyoneGraph(net: Network, focus: string | null): Graph {
  const people = net.people.filter((p) => !focus || p.links.some((l) => l.ticker === focus));
  const deg = new Map<string, number>(), edges: GE[] = [];
  for (const p of people) for (const l of p.links) { edges.push({ source: 'p:' + p.cik, target: cId(l.ticker), w: 1, who: [`${p.name} (${l.role})`] }); deg.set(cId(l.ticker), (deg.get(cId(l.ticker)) ?? 0) + 1); }
  const nodes: GN[] = [
    ...[...deg.entries()].map(([id, d]): GN => ({ id, kind: 'co', label: id.slice(2), deg: d, r: 4 + Math.sqrt(d) * 1.2, lw: labelW(id.slice(2), 10) })),
    ...people.map((p): GN => ({ id: 'p:' + p.cik, kind: 'person', label: p.name, deg: p.links.length, r: p.links.length > 1 ? 2.6 : 1.8, lw: 0 })),
  ];
  return { nodes, edges };
}

/** Run the force layout to rest (no animation), then scale it to fill the drawing area. */
function settle(g: Graph, mode: Mode) {
  const n = g.nodes.length, spread = Math.min(1, 140 / Math.max(1, n));
  const sim = forceSimulation(g.nodes)
    .force('link', forceLink<GN, GE>(g.edges).id((d) => d.id).distance((e) => (mode === 'all' ? 14 : mode === 'holders' ? 46 : 38 + 18 / e.w)).strength((e) => Math.min(1, 0.35 + e.w * 0.15)))
    .force('charge', forceManyBody<GN>().strength((d) => (d.kind === 'person' ? -6 : d.kind === 'fund' ? -260 : -70 - d.deg * 6)).distanceMax(320))
    .force('collide', forceCollide<GN>((d) => (d.kind === 'person' ? d.r + 1 : Math.max(d.r + 3, d.lw / 2 + 3) + (d.kind === 'co' ? 4 : 2))).iterations(2))
    .force('x', forceX<GN>(0).strength(0.03 + 0.04 * spread))
    .force('y', forceY<GN>(0).strength(0.07 + 0.05 * spread))
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();
  // fit into the box (keeps aspect; leaves a margin for labels)
  const xs = g.nodes.map((d) => d.x ?? 0), ys = g.nodes.map((d) => d.y ?? 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // fill the wide box: x and y scale separately, but never stretch one more than 1.5× the other
  let sx = (W - 140) / Math.max(1, x1 - x0), sy = (H - 90) / Math.max(1, y1 - y0);
  sx = Math.min(sx, sy * 1.5, 2.4); sy = Math.min(sy, sx * 1.5, 2.4);
  for (const d of g.nodes) { d.x = W / 2 + ((d.x ?? 0) - (x0 + x1) / 2) * sx; d.y = H / 2 + ((d.y ?? 0) - (y0 + y1) / 2) * sy; }
}
const ends = (e: GE) => [e.source as GN, e.target as GN] as const;
/** A gentle curve so parallel lines don't stack. */
function curve(a: GN, b: GN) {
  const mx = ((a.x ?? 0) + (b.x ?? 0)) / 2, my = ((a.y ?? 0) + (b.y ?? 0)) / 2, dx = (b.x ?? 0) - (a.x ?? 0), dy = (b.y ?? 0) - (a.y ?? 0);
  return `M${a.x},${a.y} Q${mx - dy * 0.12},${my + dx * 0.12} ${b.x},${b.y}`;
}

export function LinkView({ onOpen }: { onOpen: (t: string) => void }) {
  const net = useSource(NETWORK);
  const [mode, setMode] = useState<Mode>('links');
  const [focus, setFocus] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hov, setHov] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const g = useMemo(() => {
    if (!net.data) return null;
    const r = mode === 'holders' ? holderGraph(net.data, focus) : mode === 'all' ? everyoneGraph(net.data, focus) : insiderGraph(net.data, focus);
    if (r.nodes.length) settle(r, mode);
    return r;
  }, [net.data, mode, focus]);
  useEffect(() => { setView({ k: 1, x: 0, y: 0 }); }, [mode, focus]);

  // wheel zoom around the pointer (needs a non-passive listener to stop the page scrolling)
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
      setView((v) => { const k = Math.max(0.6, Math.min(5, v.k * Math.exp(-e.deltaY * 0.0015))); return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }; });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [g]);

  const active = hov ?? sel;
  const nb = useMemo(() => {
    const s = new Set<string>();
    if (active && g) for (const e of g.edges) { const [a, b] = ends(e); if (a.id === active) s.add(b.id); if (b.id === active) s.add(a.id); }
    return s;
  }, [active, g]);
  const selNode = g?.nodes.find((n) => n.id === sel);
  const interlocks = net.data?.people.filter((p) => p.links.length > 1).length ?? 0;
  const big = (g?.nodes.length ?? 0) > 170;
  const showLabel = (n: GN) => n.kind !== 'person' && (!active ? !big || n.deg >= 2 || n.kind !== 'co' || !!focus : n.id === active || nb.has(n.id));
  const zoomBy = (f: number) => setView((v) => { const k = Math.max(0.6, Math.min(5, v.k * f)); return { k, x: W / 2 - ((W / 2 - v.x) * k) / v.k, y: H / 2 - ((H / 2 - v.y) * k) / v.k }; });

  return (
    <Panel id="p-link" title={mode === 'holders' ? 'Link analysis · funds and activists' : 'Link analysis · insider network'} src={net} span="c12"
      right={<>
        {focus && <button className="btn" onClick={() => setFocus(null)}>✕ {focus}</button>}
        <Tabs small value={mode} onChange={(m) => { setMode(m); setSel(null); }} options={[['links', 'Shared insiders'], ['holders', 'Funds & activists'], ['all', 'Everyone']]} />
      </>}
      note={net.data ? `${net.data.companies.length} companies · ${net.data.people.length} officers, directors and 10% owners from recent Form 4 filings · ${interlocks} sit at two or more. Shared insiders: a line joins two companies when the same person files at both (thicker for more people). Funds & activists: ${net.data.holders?.filter((h) => h.kind === 'fund').length ?? 0} well-known funds’ latest 13F positions of 2% or more of the fund, and 13D filers (5%+ holders who may seek to influence the company). Hover to trace, click to select, double-click a company to open it, scroll to zoom, drag to pan.` : 'Built daily from SEC Form 4, 13F and 13D filings.'}>
      {g && (
        <div className="net">
          <div className="net-stage">
            <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Network graph"
              onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; }}
              onPointerMove={(e) => {
                const d = drag.current; if (!d || !svg.current) return;
                const s = W / svg.current.getBoundingClientRect().width, dx = (e.clientX - d.x) * s, dy = (e.clientY - d.y) * s;
                if (Math.abs(dx) + Math.abs(dy) > 3) { d.moved = true; setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy })); }
              }}
              onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
              onPointerLeave={() => { drag.current = null; setHov(null); }}
              onClick={() => { if (!drag.current?.moved) setSel(null); }}>
              <defs>
                <radialGradient id="net-node" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#2a2d31" /><stop offset="1" stopColor="#141518" /></radialGradient>
                <radialGradient id="net-hot" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#a9c8e6" /><stop offset="1" stopColor="#4f7aa6" /></radialGradient>
                <filter id="net-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" /></filter>
                <pattern id="net-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.035)" strokeDasharray="2 4" /></pattern>
              </defs>
              <rect width={W} height={H} fill="url(#net-grid)" />
              <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                {g.edges.map((e, i) => {
                  const [a, b] = ends(e), on = !!active && (a.id === active || b.id === active);
                  return <path key={i} d={curve(a, b)} fill="none" stroke={on ? '#a9c8e6' : mode === 'links' ? 'rgba(169,200,230,0.2)' : 'rgba(169,200,230,0.09)'} strokeWidth={(on ? 1.4 : 0.8) * Math.min(3, 0.7 + e.w * 0.45) / Math.sqrt(view.k)}
                    opacity={active && !on ? 0.25 : 1} strokeLinecap="round"><title>{e.who.slice(0, 6).join('\n')}{e.who.length > 6 ? `\n+${e.who.length - 6} more` : ''}</title></path>;
                })}
                {g.nodes.map((n) => {
                  const on = n.id === active, near = nb.has(n.id), dim = !!active && !on && !near;
                  const handlers = {
                    onPointerEnter: () => setHov(n.id), onPointerLeave: () => setHov(null),
                    onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (!drag.current?.moved) setSel(n.id === sel ? null : n.id); },
                    onDoubleClick: () => { if (n.kind === 'co') onOpen(n.label); },
                  };
                  const fs = (n.kind === 'co' ? 10.5 : 11) / Math.sqrt(view.k);
                  if (n.kind === 'person') return <circle key={n.id} cx={n.x} cy={n.y} r={n.r} fill={on || near ? '#a9c8e6' : 'rgba(200,210,220,0.45)'} opacity={dim ? 0.2 : 1} style={{ cursor: 'pointer' }} {...handlers}><title>{n.label}</title></circle>;
                  if (n.kind === 'fund' || n.kind === '13D') {
                    const w = n.lw, h = 20;
                    return <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.25 : 1} style={{ cursor: 'pointer' }} {...handlers}>
                      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={on ? 'rgba(124,169,212,0.28)' : 'rgba(18,20,24,0.92)'} stroke={n.kind === 'fund' ? '#7ca9d4' : 'rgba(255,255,255,0.5)'} strokeWidth={on ? 1.4 : 0.9} />
                      <circle cx={-w / 2 + 10} cy={0} r={2.6} fill={n.kind === 'fund' ? '#7ca9d4' : '#f1f1f1'} />
                      <text x={-w / 2 + 18} y={3.8} style={{ fill: '#e8ecf0', font: `400 11px var(--sans)` }}>{n.label}</text>
                    </g>;
                  }
                  return <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.22 : 1} style={{ cursor: 'pointer' }} {...handlers}>
                    {(on || n.id === sel) && <circle r={n.r + 6} fill="#7ca9d4" opacity={0.35} filter="url(#net-glow)" />}
                    <circle r={n.r} fill={on || n.id === sel ? 'url(#net-hot)' : 'url(#net-node)'} stroke={on || near ? '#a9c8e6' : 'rgba(255,255,255,0.22)'} strokeWidth={0.9 / Math.sqrt(view.k)} />
                    {showLabel(n) && <text y={n.r + fs + 2} textAnchor="middle" style={{ fill: on ? '#ffffff' : near ? '#dce6ef' : '#aeb5bd', font: `${on ? 500 : 400} ${fs}px var(--sans)`, letterSpacing: '.02em', paintOrder: 'stroke', stroke: '#111214', strokeWidth: 3 / Math.sqrt(view.k) }}>{n.label}</text>}
                  </g>;
                })}
              </g>
            </svg>
            <div className="net-ctl">
              <button className="btn" onClick={() => zoomBy(1.3)} aria-label="Zoom in">+</button>
              <button className="btn" onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out">−</button>
              <button className="btn" onClick={() => setView({ k: 1, x: 0, y: 0 })}>Reset</button>
            </div>
            <div className="net-key">
              {mode === 'holders' ? <><span><i className="k-pill b" />Fund (13F)</span><span><i className="k-pill w" />13D filer</span><span><i className="k-dot" />Company</span></>
                : mode === 'all' ? <><span><i className="k-dot" />Company</span><span><i className="k-dot s" />Insider</span></>
                  : <><span><i className="k-dot" />Company (bigger = more links)</span><span><i className="k-line" />Shared insider</span></>}
              <span className="faint">{g.nodes.filter((n) => n.kind === 'co').length} companies</span>
            </div>
          </div>
          <aside className="net-side">
            {!selNode && <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{mode === 'holders' ? 'Pick a fund or company to see what links them.' : mode === 'links' ? 'Each line is a person who files Form 4 at both companies: a director on two boards, an executive with an outside seat, or a 10% owner. Pick a company to see who connects it.' : 'Every officer, director and 10% owner with a recent Form 4, and their companies.'}</p>}
            {selNode?.kind === 'co' && (() => {
              const t = selNode.label, c = net.data!.companies.find((x) => x.ticker === t);
              const ppl = net.data!.people.filter((p) => p.links.some((l) => l.ticker === t));
              const own = (net.data!.holders ?? []).filter((h) => h.links.some((l) => l.ticker === t));
              const via = new Map<string, string[]>();
              for (const p of ppl) for (const l of p.links) if (l.ticker !== t) via.set(l.ticker, [...(via.get(l.ticker) ?? []), p.name]);
              return <>
                <h3>{c?.name ?? t}</h3><p className="dim" style={{ fontSize: 11.5 }}>{c?.industry}</p>
                <div style={{ display: 'flex', gap: 6, margin: '10px 0 12px' }}><button className="btn pri" onClick={() => onOpen(t)}>Open {t}</button><button className="btn" onClick={() => setFocus(t)}>Focus</button></div>
                {via.size > 0 && <><div className="sub">Connected to</div><ul className="feed" style={{ marginBottom: 10 }}>{[...via.entries()].sort((a, b) => b[1].length - a[1].length).map(([tk, who]) => <li key={tk}><span className="ttl"><button className="link" onClick={() => setSel(cId(tk))}><b className="mono">{tk}</b></button><small>{who.join(', ')}</small></span></li>)}</ul></>}
                {own.length > 0 && <><div className="sub">Funds and 13D filers</div><ul className="feed" style={{ marginBottom: 10 }}>{own.map((h) => <li key={h.id}><span className="ttl">{h.name}<small>{h.kind === 'fund' ? '13F fund' : '13D filer'}</small></span><span className="mono">{h.links.find((l) => l.ticker === t)?.pct?.toFixed(1) ?? '—'}%</span></li>)}</ul></>}
                <div className="sub">Insiders ({ppl.length})</div>
                <ul className="feed">{ppl.slice(0, 30).map((p) => <li key={p.cik}><span className="ttl">{p.name}<small>{p.links.find((l) => l.ticker === t)?.role}</small></span></li>)}</ul>
              </>;
            })()}
            {selNode && (selNode.kind === 'fund' || selNode.kind === '13D') && (() => {
              const h = net.data!.holders?.find((x) => x.id === selNode.id);
              return h ? <>
                <h3>{h.name}</h3><p className="dim" style={{ fontSize: 11.5 }}>{h.kind === 'fund' ? 'Latest 13F · % of the fund’s reported portfolio' : 'Schedule 13D · % of the company'}</p>
                <ul className="feed" style={{ marginTop: 8 }}>{[...h.links].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).map((l) => <li key={l.ticker}><span className="ttl"><button className="link" onClick={() => onOpen(l.ticker)}><b className="mono">{l.ticker}</b></button></span><span className="mono">{l.pct != null ? l.pct.toFixed(1) + '%' : '—'}</span></li>)}</ul>
              </> : null;
            })()}
            {selNode?.kind === 'person' && (() => {
              const p = net.data!.people.find((x) => 'p:' + x.cik === selNode.id);
              return p ? <><h3>{p.name}</h3><ul className="feed" style={{ marginTop: 8 }}>{p.links.map((l) => <li key={l.ticker}><span className="ttl"><button className="link" onClick={() => onOpen(l.ticker)}><b className="mono">{l.ticker}</b></button><small>{l.role}</small></span></li>)}</ul></> : null;
            })()}
          </aside>
        </div>
      )}
      {!g && net.status === 'error' && <div className="empty">The network is built by the snapshot job (npm run snapshot). {net.error}</div>}
    </Panel>
  );
}
