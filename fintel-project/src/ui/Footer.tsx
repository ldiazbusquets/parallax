import { useEffect, useRef } from 'react';
import { goTo } from './Command';

// The site footer, in the same pattern as Luis's other sites (main site, Finance, Lab, Health): a sign-off, three link
// columns, a bottom bar, and a large wordmark whose letters drift in and out of focus.
const WORD = 'parallax';
const TABS: [string, string][] = [['overview', 'Overview'], ['markets', 'Markets'], ['macro', 'Macro & Rates'], ['geo', 'Geo'], ['companies', 'Companies']];
const TEAM: [string, string][] = [
  ['Luis Diaz Busquets', 'https://www.linkedin.com/in/luis-diaz-busquets'],
  ['Martin Fantauzzi Figueroa', 'https://www.linkedin.com/in/martin-fantauzzi-92b294256/'],
  ['Martha Ortiz Serrano', 'https://www.linkedin.com/in/marthadannelix/'],
];
const START: [string, string][] = [['p-map', 'World map'], ['p-screener', 'Stock screener'], ['p-ecocal', 'Economic calendar'], ['p-govies', 'Government bonds'], ['p-link', 'Insider network']];

function Wordmark() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wm = ref.current;
    if (!wm || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const L = [...wm.querySelectorAll('span')] as HTMLSpanElement[];
    let wx = -1, on = false, raf = 0;
    const t0 = performance.now();
    const move = (e: PointerEvent) => { wx = e.clientX; }, leave = () => { wx = -1; };
    const frame = (now: number) => {
      if (!on) return;
      const t = (now - t0) / 1000;
      L.forEach((s, i) => {
        const r = s.getBoundingClientRect(), c = r.left + r.width / 2;
        let b: number;
        if (wx >= 0) b = Math.min(14, Math.abs(wx - c) / 40);
        else { const ph = (t * 0.45 - i / L.length) % 1.6; b = ph > 0 && ph < 0.45 ? 14 * Math.sin((ph / 0.45) * Math.PI) : 0; }
        s.style.filter = `blur(${b.toFixed(1)}px)`;
      });
      raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !on) { on = true; raf = requestAnimationFrame(frame); } if (!e.isIntersecting) on = false; });
    io.observe(wm);
    wm.addEventListener('pointermove', move); wm.addEventListener('pointerleave', leave);
    return () => { io.disconnect(); cancelAnimationFrame(raf); wm.removeEventListener('pointermove', move); wm.removeEventListener('pointerleave', leave); };
  }, []);
  return <div className="wm" ref={ref} aria-hidden="true">{[...WORD].map((c, i) => <span key={i}>{c}</span>)}</div>;
}

export function Footer({ onTab }: { onTab: (id: string) => void }) {
  return (
    <footer className="site-foot">
      <div className="fw">
        <div className="fgrid">
          <div>
            <p className="big4">Thanks for watching the tape. <em>Let’s talk markets.</em></p>
            <p style={{ marginTop: 16 }}>Built by Luis Diaz Busquets, Martin Fantauzzi Figueroa and Martha Ortiz Serrano. Every number comes from a public source; the status menu at the top right lists each one and when it last updated.</p>
          </div>
          <div><h5>Parallax</h5>{TABS.map(([id, l]) => <p key={id}><a href={'#/w/' + id} onClick={(e) => { e.preventDefault(); onTab(id); scrollTo({ top: 0, behavior: 'smooth' }); }}>{l}</a></p>)}<p><a href="https://github.com/ldiazbusquets/parallax" target="_blank" rel="noopener noreferrer">Source on GitHub</a></p></div>
          <div><h5>Start here</h5>{START.map(([id, l]) => <p key={id}><a href={'#' + id} onClick={(e) => { e.preventDefault(); goTo(id); }}>{l}</a></p>)}</div>
          <div><h5>The team</h5>
            {TEAM.map(([name, url]) => <p key={name}><a href={url} target="_blank" rel="noopener noreferrer">{name}</a></p>)}
          </div>
        </div>
        <p className="install-hint">Use it as an app: in Chrome or Edge, click <b>Install app</b> at the top (or the install icon in the address bar). On iPhone or iPad, Share → Add to Home Screen; on a Mac in Safari, File → Add to Dock.</p>
        <div className="fbar"><span>No cookies, no tracking</span><span>© {new Date().getFullYear()} Luis Diaz Busquets, Martin Fantauzzi Figueroa &amp; Martha Ortiz Serrano</span><span>Delayed public data. Not investment advice.</span></div>
      </div>
      <Wordmark />
    </footer>
  );
}
