import { useEffect, useState, type ReactNode } from 'react';

// Panel layout: workspaces (tabs), each an ordered list of panels with grid widths, editable and saved per browser.

export type Span = 'c3' | 'c4' | 'c6' | 'c8' | 'c12';
export interface Item { key: string; span: Span }
export const SPANS: Span[] = ['c3', 'c4', 'c6', 'c8', 'c12'];

const it = (s: string): Item[] => s.trim().split(/\s+/).map((x) => { const [key, n] = x.split(':'); return { key, span: ('c' + n) as Span }; });

/** Workspaces: tabs across the top, each with its own panel layout (rows sum to 12). */
export interface Workspace { id: string; name: string; items: Item[] }
export const WORKSPACES: Workspace[] = [
  // rows are paired by natural panel height so cards line up (measured on the live site, Nov 2026)
  { id: 'overview', name: 'Overview', items: it('map:8 indices:4 heatmap:8 vol:4 news:6 brief:6 sectors:4 ecocal:4 shipping:4') },
  { id: 'markets', name: 'Markets', items: it('indices:4 cmdty:4 crypto:4 heatmap:8 vol:4 sectors:4 fx:4 hist:4 watch:8 alerts:4 screener:12 cot:12') },
  { id: 'macro', name: 'Macro & Rates', items: it('curve:4 govies:4 cb:4 eco:8 ecocal:4 credit:4 rates:4 auctions:4 weo:12 cot:12') },
  { id: 'geo', name: 'Geo', items: it('map:12 events:8 shipping:4 weo:12 rates:4 fx:4 cmdty:4') },
  { id: 'companies', name: 'Companies', items: it('link:12 filings:4 cal:4 news:4 watch:8 shorts:4 screener:12') },
];
const KEY = 'fintel.workspaces'; // { active, custom: { [workspaceId]: Item[] } }
const OLD_KEY = 'fintel.layout';  // single custom layout from before workspaces

const fromHash = () => { const m = location.hash.match(/^#\/w\/([a-z]+)/); return m && WORKSPACES.some((w) => w.id === m[1]) ? m[1] : null; };

export function useWorkspaces(known: string[]) {
  const [state, setState] = useState<{ active: string; custom: Record<string, Item[]> }>(() => {
    let saved: { active?: string; custom?: Record<string, Item[]> } = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
    const custom = saved.custom ?? {};
    try { // carry an old custom layout into Overview once
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null') as { name?: string; items?: Item[] } | null;
      if (old?.name === 'Custom' && old.items?.length && !custom.overview) custom.overview = old.items;
      localStorage.removeItem(OLD_KEY);
    } catch { /* ignore */ }
    const active = fromHash() ?? (WORKSPACES.some((w) => w.id === saved.active) ? saved.active! : 'overview');
    return { active, custom };
  });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }, [state]);
  useEffect(() => { const f = () => { const h = fromHash(); if (h) setState((s) => ({ ...s, active: h })); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const ws = WORKSPACES.find((w) => w.id === state.active) ?? WORKSPACES[0];
  const items = (state.custom[ws.id] ?? ws.items).filter((i) => known.includes(i.key));
  const edit = (f: (items: Item[]) => Item[]) => setState((s) => ({ ...s, custom: { ...s.custom, [ws.id]: f(items.map((i) => ({ ...i }))) } }));
  const go = (id: string) => {
    setState((s) => ({ ...s, active: id }));
    if (!location.hash.startsWith('#/c/')) history.replaceState(null, '', `#/w/${id}`);
  };
  return {
    ws, items, customised: !!state.custom[ws.id], go,
    /** which workspace shows a panel by default (the current one first) */
    home: (key: string) => (items.some((i) => i.key === key) ? ws.id : WORKSPACES.find((w) => (state.custom[w.id] ?? w.items).some((i) => i.key === key))?.id),
    reset: () => setState((s) => { const c = { ...s.custom }; delete c[ws.id]; return { ...s, custom: c }; }),
    move: (key: string, d: -1 | 1) => edit((xs) => { const i = xs.findIndex((x) => x.key === key), j = i + d; if (i < 0 || j < 0 || j >= xs.length) return xs; [xs[i], xs[j]] = [xs[j], xs[i]]; return xs; }),
    moveTo: (key: string, before: string) => edit((xs) => { const i = xs.findIndex((x) => x.key === key); if (i < 0 || key === before) return xs; const [m] = xs.splice(i, 1); const j = xs.findIndex((x) => x.key === before); xs.splice(j < 0 ? xs.length : j, 0, m); return xs; }),
    resize: (key: string, d: -1 | 1) => edit((xs) => xs.map((x) => (x.key === key ? { ...x, span: SPANS[Math.max(0, Math.min(SPANS.length - 1, SPANS.indexOf(x.span) + d))] } : x))),
    hide: (key: string) => edit((xs) => xs.filter((x) => x.key !== key)),
    show: (key: string, span: Span) => edit((xs) => (xs.some((x) => x.key === key) ? xs : [...xs, { key, span }])),
  };
}

export function Slot({ item, editing, label, children, onMove, onResize, onHide, onDrop }: {
  item: Item; editing: boolean; label: string; children: ReactNode;
  onMove: (d: -1 | 1) => void; onResize: (d: -1 | 1) => void; onHide: () => void; onDrop: (from: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div className={'slot ' + item.span + (editing ? ' editing' : '') + (over ? ' over' : '')}
      draggable={editing} onDragStart={(e) => e.dataTransfer.setData('text/plain', item.key)}
      onDragOver={(e) => { if (editing) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const k = e.dataTransfer.getData('text/plain'); if (k) onDrop(k); }}>
      {editing && (
        <div className="slot-bar" aria-label={`Layout controls for ${label}`}>
          <span className="grip" title="Drag to move">⠿ {label}</span>
          <button className="btn" onClick={() => onMove(-1)} aria-label="Move earlier">←</button>
          <button className="btn" onClick={() => onMove(1)} aria-label="Move later">→</button>
          <button className="btn" onClick={() => onResize(-1)} aria-label="Narrower">−</button>
          <span className="mono dim" style={{ fontSize: 10.5 }}>{item.span.slice(1)}/12</span>
          <button className="btn" onClick={() => onResize(1)} aria-label="Wider">+</button>
          <button className="btn" onClick={onHide} aria-label="Hide panel">Hide</button>
        </div>
      )}
      {children}
    </div>
  );
}
