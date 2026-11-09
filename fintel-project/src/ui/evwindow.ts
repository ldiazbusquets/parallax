import { useEffect, useState } from 'react';
import type { EventsData } from '@/data/events';

// Which events window the map and the events panel show: the last 24 hours (default) or 7 days. Shared and remembered.
export type EvWindow = '24h' | '7d';
const KEY = 'fintel.evwindow';
let cur: EvWindow = (() => { try { return localStorage.getItem(KEY) === '7d' ? '7d' : '24h'; } catch { return '24h'; } })();
const subs = new Set<(w: EvWindow) => void>();
export function useEventWindow(): [EvWindow, (w: EvWindow) => void] {
  const [w, setW] = useState(cur);
  useEffect(() => { subs.add(setW); return () => { subs.delete(setW); }; }, []);
  return [w, (x) => { cur = x; try { localStorage.setItem(KEY, x); } catch { /* storage blocked */ } subs.forEach((f) => f(x)); }];
}
/** The data for the chosen window (the week is missing until the published file has one). */
export const pickWindow = (d: EventsData | undefined, w: EvWindow): EventsData | undefined => (w === '7d' ? d?.week ?? d : d);
