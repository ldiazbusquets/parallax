import { useEffect, useMemo, useRef, useState } from 'react';

// Bloomberg-style command line. Type a function mnemonic (WEI, YCRV, ECO…) to jump to it, or a ticker
// (optionally followed by GP) to chart it. Open with "/" or Ctrl/⌘+K.

export interface Fn { code: string; name: string; target: string; keywords?: string }
export const FUNCTIONS: Fn[] = [
  { code: 'MAP', name: 'Global markets map', target: 'p-map', keywords: 'world country geo' },
  { code: 'WEI', name: 'World equity indices', target: 'p-indices', keywords: 'index stocks global' },
  { code: 'SECT', name: 'US sectors', target: 'p-sectors', keywords: 'sector etf rotation' },
  { code: 'VOL', name: 'Volatility', target: 'p-vol', keywords: 'vix move skew' },
  { code: 'FXC', name: 'Currencies', target: 'p-fx', keywords: 'fx dollar forex' },
  { code: 'IMAP', name: 'Market heatmap (sized by market value)', target: 'p-heatmap', keywords: 'heatmap treemap movers market cap sectors' },
  { code: 'CMDTY', name: 'Commodities', target: 'p-cmdty', keywords: 'oil gold copper' },
  { code: 'GP', name: 'Chart & watchlist', target: 'p-watch', keywords: 'chart graph price' },
  { code: 'CRYPTO', name: 'Crypto', target: 'p-crypto', keywords: 'bitcoin btc eth' },
  { code: 'YCRV', name: 'Treasury yield curve', target: 'p-curve', keywords: 'rates bonds yields' },
  { code: 'BTMM', name: 'Fed, central banks & liquidity', target: 'p-cb', keywords: 'fomc fed funds liquidity' },
  { code: 'EVNT', name: 'Market-moving events: war, unrest, sanctions, natural hazards', target: 'p-events', keywords: 'events conflict war strikes sanctions geopolitics gdelt earthquake hurricane cyclone wildfire tsunami flood volcano disaster' },
  { code: 'SHIP', name: 'Shipping chokepoints (IMF PortWatch)', target: 'p-shipping', keywords: 'shipping suez panama hormuz malacca strait trade ships tankers portwatch freight' },
  { code: 'WEO', name: 'IMF World Economic Outlook by country', target: 'p-weo', keywords: 'imf gdp growth inflation debt deficit forecast global economy countries' },
  { code: 'POLR', name: 'Global central bank policy rates', target: 'p-rates', keywords: 'policy rates central banks ecb boe boj global bis hikes cuts' },
  { code: 'CRDT', name: 'Credit & financial conditions', target: 'p-credit', keywords: 'spreads hy ig' },
  { code: 'ECO', name: 'US economy', target: 'p-eco', keywords: 'cpi jobs gdp macro' },
  { code: 'COT', name: 'Speculative positioning (CFTC)', target: 'p-cot', keywords: 'positioning futures' },
  { code: 'TOP', name: 'Headlines', target: 'p-news', keywords: 'news' },
  { code: 'CF', name: 'SEC filings', target: 'p-filings', keywords: 'edgar 8-k insider' },
  { code: 'EVTS', name: 'Earnings & IPOs', target: 'p-cal', keywords: 'earnings ipo calendar' },
  { code: 'AUCT', name: 'Treasury auctions', target: 'p-auctions', keywords: 'auction bills notes' },
  { code: 'HIST', name: 'S&P 500 by calendar year', target: 'p-hist', keywords: 'history returns' },
  { code: 'BRIEF', name: 'AI morning brief', target: 'p-brief', keywords: 'ai summary' },
  { code: 'LINK', name: 'Link analysis: insider network', target: 'p-link', keywords: 'network graph palantir board insiders' },
  { code: 'ALRT', name: 'Alerts', target: 'p-alerts', keywords: 'alert notify' },
  { code: 'ECAL', name: 'Economic calendar (this week)', target: 'p-ecocal', keywords: 'calendar releases cpi nfp data forecast consensus' },
  { code: 'GOVT', name: 'Government bonds, 10-year (daily)', target: 'p-govies', keywords: 'bund gilt jgb sovereign yields bonds global' },
  { code: 'EQS', name: 'Stock screener', target: 'p-screener', keywords: 'screen filter stocks market cap sector movers' },
  { code: 'SI', name: 'Short interest', target: 'p-shorts', keywords: 'short squeeze days to cover finra' },
];

export function goTo(target: string) {
  const el = document.getElementById(target);
  if (!el) { window.dispatchEvent(new CustomEvent('fintel:need-panel', { detail: target })); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

export function CommandBar({ onTicker, onCompany }: { onTicker: (sym: string) => void; onCompany: (sym: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.('input, textarea, select');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  useEffect(() => { if (!open) { setQ(''); setI(0); } }, [open]);

  const words = q.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const fns = !s ? FUNCTIONS : FUNCTIONS.filter((f) => f.code.toLowerCase().startsWith(s) || f.name.toLowerCase().includes(s) || f.keywords?.includes(s));
    const out: { label: string; hint: string; run: () => void }[] = fns.map((f) => ({ label: f.code, hint: f.name, run: () => goTo(f.target) }));
    // "AAPL" -> company page (DES) or chart (GP); "AAPL GP" / "AAPL DES" pick one
    const sym = words[0], fn = words[1];
    if (sym && /^[A-Z0-9^=.\-]{1,12}$/.test(sym) && !FUNCTIONS.some((f) => f.code === sym && words.length === 1)) {
      const des = { label: sym + ' DES', hint: `Company page: profile, financials, insiders, filings`, run: () => onCompany(sym) };
      const gp = { label: sym + ' GP', hint: `Chart ${sym}`, run: () => { onTicker(sym); goTo('p-watch'); } };
      const t = fn === 'GP' ? [gp, des] : fn === 'DES' || fn === 'FA' || fn === 'CF' ? [des, gp] : [des, gp];
      // A function whose code starts with what was typed wins; otherwise treat the input as a ticker first.
      const fnFirst = words.length === 1 && FUNCTIONS.some((f) => f.code.startsWith(sym));
      if (fnFirst) out.push(...t); else out.unshift(...t);
    }
    return out;
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const exec = (k: number) => { const it = items[k]; if (it) { it.run(); setOpen(false); } };

  return (
    <>
      <button className="cmd-open" onClick={() => setOpen(true)} aria-label="Open command line">
        <span className="faint">&gt;</span> <span>Type a ticker or function</span> <kbd>/</kbd>
      </button>
      {open && (
        <div className="modal cmd" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Command line">
          <div className="cmd-in" onClick={(e) => e.stopPropagation()}>
            <input ref={input} autoFocus className="cmd-q" value={q} placeholder="NVDA DES · AAPL GP · WEI · YCRV · ECO · LINK …" aria-label="Command"
              onChange={(e) => { setQ(e.target.value); setI(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
                if (e.key === 'Enter') { e.preventDefault(); exec(i); }
              }} />
            <ul className="cmd-list" role="listbox">
              {items.map((it, k) => (
                <li key={it.label} role="option" aria-selected={k === i} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onClick={() => exec(k)}>
                  <b>{it.label}</b><span>{it.hint}</span>
                </li>
              ))}
              {!items.length && <li className="dim" style={{ padding: 10 }}>No match.</li>}
            </ul>
            <div className="cmd-foot faint">↑↓ to move · Enter to run · Esc to close</div>
          </div>
        </div>
      )}
    </>
  );
}
