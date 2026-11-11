import { useEffect, useState } from 'react';
import { STATIC } from '@/lib/env';

declare const __BUILD__: string;
/** True when the website has been redeployed since this tab loaded (checks version.json every 3 minutes and
 *  whenever the tab comes back). Pages are cached by browsers and installed apps, so without this people keep
 *  seeing an old build. */
export function useUpdateReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!STATIC || typeof __BUILD__ === 'undefined') return;
    let stop = false;
    const check = async () => {
      if (stop || document.hidden) return;
      try {
        const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (build && build !== __BUILD__) setReady(true);
      } catch { /* offline: try later */ }
    };
    const t = setInterval(check, 3 * 60_000);
    const vis = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', vis);
    void check();
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return ready;
}
