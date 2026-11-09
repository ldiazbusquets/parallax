import { memo, useEffect, useState, type ReactNode } from 'react';
import type { SourceState, Status } from '@/data/store';
import { ago, isNum, pct, toneClass } from '@/lib/format';
import { T } from './theme';

// ---------- live clock so "updated 2m ago" labels stay current ----------
const nowListeners = new Set<(n: number) => void>();
setInterval(() => { const n = Date.now(); nowListeners.forEach((f) => f(n)); }, 15_000);
export function useNow(): number {
  const [n, setN] = useState(Date.now());
  useEffect(() => { nowListeners.add(setN); return () => { nowListeners.delete(setN); }; }, []);
  return n;
}

// ---------- status ----------
const STATUS_TEXT: Record<Status, string> = { loading: 'loading', live: 'live', stale: 'stale', error: 'unavailable', 'needs-key': 'needs key' };
export const Dot = memo(function Dot({ status }: { status: Status }) {
  return <i className={'dot dot-' + status} aria-label={STATUS_TEXT[status]} />;
});

/** Combine several sources into one status for a panel header. */
export function combine(states: SourceState<unknown>[]): { status: Status; updated?: number; error?: string; provider: string } {
  const order: Status[] = ['needs-key', 'error', 'loading', 'stale', 'live'];
  const status = order.find((s) => states.some((x) => x.status === s)) ?? 'loading';
  const updated = Math.min(...states.map((s) => s.updated ?? Infinity));
  return { status, updated: Number.isFinite(updated) ? updated : undefined, error: states.find((s) => s.error)?.error, provider: [...new Set(states.map((s) => s.provider))].join(' · ') };
}

// ---------- panel ----------
interface PanelProps {
  title: string;
  src: SourceState<unknown> | SourceState<unknown>[];
  span?: string;                 // grid class, e.g. "c4", "c8"
  right?: ReactNode;             // header controls
  note?: ReactNode;              // what the numbers are and where they come from, folded under "About this data"
  children?: ReactNode;
  hasData?: boolean;             // override: whether to render children
  id?: string;
}
export function Panel({ title, src, span = 'c4', right, note, children, hasData, id }: PanelProps) {
  const now = useNow();
  const list = Array.isArray(src) ? src : [src];
  const s = combine(list);
  const has = hasData ?? list.some((x) => x.data !== undefined);
  return (
    <section className={'panel ' + span} id={id} aria-label={title}>
      {/* Source and freshness live in the header tooltip and the status menu (top right); the card only flags a problem. */}
      <header className="ph" title={`${s.provider}${s.updated ? ' · updated ' + ago(s.updated, now) : ''}${s.error ? ' · ' + s.error : ''}`}>
        <h2>{title}</h2>
        {(s.status === 'stale' || s.status === 'error') && has && <span className="ph-flag" title={s.error || ''}><Dot status={s.status} />{s.status === 'stale' ? `stale${s.updated ? ' · ' + ago(s.updated, now) : ''}` : 'update failed'}</span>}
        <div className="ph-r">{right}</div>
      </header>
      <div className="pb">
        {has ? children : <Empty status={s.status} error={s.error} />}
      </div>
      {note && <details className="pnote"><summary>About this data</summary><div>{note}</div></details>}
    </section>
  );
}

function Empty({ status, error }: { status: Status; error?: string }) {
  if (status === 'loading') return <div className="empty"><span className="shimmer" />Loading…</div>;
  if (status === 'needs-key') return <div className="empty"><span>Needs a free API key: <button className="link" onClick={() => window.dispatchEvent(new CustomEvent('fintel:settings'))}>add one in Settings</button></span></div>;
  return <div className="empty">Unavailable right now{error ? `: ${error}` : ''}. Retrying automatically.</div>;
}

// ---------- numbers ----------
export const Chg = memo(function Chg({ v, dp = 2, suffix = '%', invert = false, bare = false }: { v: number | null | undefined; dp?: number; suffix?: string; invert?: boolean; bare?: boolean }) {
  if (!isNum(v)) return <span className="flat">—</span>;
  const txt = suffix === '%' ? pct(v, dp) : (v > 0 ? '+' : '') + v.toFixed(dp) + suffix;
  return <span className={bare ? '' : toneClass(v, invert)}>{txt}</span>;
});

/** A display number with its decimals dimmed (78.3 → 78 bright, .3 dim), as in the reference design. */
export function Big({ children }: { children?: ReactNode }) {
  if (typeof children !== 'string' && typeof children !== 'number') return <>{children}</>;
  const s = String(children);
  if ((s.match(/\d\.\d/g) || []).length !== 1) return <>{s}</>;
  const m = s.match(/^(.*?\d)(\.\d+)(.*)$/);
  return m ? <>{m[1]}<span className="frac">{m[2]}</span>{m[3]}</> : <>{s}</>;
}

// ---------- sparkline ----------
export const Spark = memo(function Spark({ data, w = 80, h = 22, base, color, fill = true }: { data: number[]; w?: number; h?: number; base?: number | null; color?: string; fill?: boolean }) {
  if (!data || data.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  let min = Math.min(...data), max = Math.max(...data);
  if (isNum(base)) { min = Math.min(min, base); max = Math.max(max, base); }
  const r = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - 2 - ((v - min) / r) * (h - 4);
  const d = data.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join('');
  const up = data[data.length - 1] >= (isNum(base) ? base : data[0]);
  const c = color || (up ? T.up : T.down);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className="spark">
      {isNum(base) && <line x1="0" x2={w} y1={y(base)} y2={y(base)} stroke={T.lineHi} strokeDasharray="2 2" strokeWidth="1" />}
      {fill && <path d={d + `L${w},${h}L0,${h}Z`} fill={c} opacity="0.1" />}
      <path d={d} fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
});

// ---------- tabs ----------
export function Tabs<K extends string>({ value, options, onChange, small }: { value: K; options: [K, string][]; onChange: (k: K) => void; small?: boolean }) {
  return (
    <div className={'tabs' + (small ? ' sm' : '')} role="tablist">
      {options.map(([k, l]) => <button key={k} role="tab" aria-selected={k === value} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

/** A small horizontal bar showing where v sits between lo and hi (e.g. 52-week range). */
export function RangeBar({ lo, hi, v, w = 70 }: { lo?: number; hi?: number; v?: number; w?: number }) {
  if (!isNum(lo) || !isNum(hi) || !isNum(v) || hi <= lo) return <span className="flat">—</span>;
  const p = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return <span className="rbar" style={{ width: w }} title={`${(p * 100).toFixed(0)}% of range`}><i style={{ left: `calc(${p * 100}% - 1px)` }} /></span>;
}
