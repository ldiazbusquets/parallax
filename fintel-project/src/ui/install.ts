import { useEffect, useState } from 'react';

// "Install app": Chrome/Edge fire beforeinstallprompt when the site can be installed from its manifest.
// Safari has no prompt; there it's Share → Add to Home Screen (iPhone/iPad) or File → Add to Dock (Mac).
interface PromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: PromptEvent | null = null;
const subs = new Set<() => void>();
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; subs.forEach((f) => f()); });
  addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
}
export const isInstalled = () => typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
export function useInstall(): [boolean, () => void] {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return [!!deferred && !isInstalled(), () => { const d = deferred; if (!d) return; d.prompt().finally(() => { deferred = null; subs.forEach((f) => f()); }); }];
}
