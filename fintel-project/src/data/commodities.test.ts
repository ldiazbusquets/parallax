import { describe, expect, it } from 'vitest';
import { CURVE_DEFS, changeCorr, contracts, curveFrom, curveStats, fiveYear, pair, pctile, weekly } from './commodities';

const day = 864e5;
const cl = CURVE_DEFS.find((d) => d.key === 'cl')!, gc = CURVE_DEFS.find((d) => d.key === 'gc')!;

describe('contracts', () => {
  it('lists every month for energy and only delivery months for metals', () => {
    const now = new Date(Date.UTC(2026, 10, 19));
    const c = contracts(cl, now);
    expect(c).toHaveLength(24);
    expect(c[0].sym).toBe('CLX26.NYM');
    expect(c[2].sym).toBe('CLF27.NYM');
    const g = contracts(gc, now).map((x) => x.sym);
    expect(g.slice(0, 3)).toEqual(['GCZ26.CMX', 'GCG27.CMX', 'GCJ27.CMX']);
  });
});

describe('curveFrom', () => {
  const now = Date.UTC(2026, 10, 19, 20);
  const ts = (n: number, end = now) => Array.from({ length: n }, (_, i) => Math.floor((end - (n - 1 - i) * day) / 1000));
  it('uses settlements when the last trade is stale and drops contracts that stopped settling', () => {
    const res = [
      { symbol: 'CLX26.NYM', response: [{ meta: { regularMarketPrice: 60, regularMarketTime: (now - 20 * day) / 1000 }, timestamp: ts(8, now - 10 * day), indicators: { quote: [{ close: [1, 1, 1, 1, 1, 1, 1, 1] }] } }] },
      { symbol: 'CLZ26.NYM', response: [{ meta: { regularMarketPrice: 59.5, regularMarketTime: now / 1000 - 60 }, timestamp: ts(8, now - day), indicators: { quote: [{ close: [55, 56, 57, 58, 59, 58, 58.5, 59] }] } }] },
      { symbol: 'CLF27.NYM', response: [{ meta: { regularMarketPrice: 40, regularMarketTime: (now - 90 * day) / 1000 }, timestamp: ts(8), indicators: { quote: [{ close: [60, 60, 60, null, 61, 61, 61, 61.2] }] } }] },
    ];
    const c = curveFrom(cl, res, now);
    expect(c.pts.map((p) => p.sym)).toEqual(['CLZ26.NYM', 'CLF27.NYM']);
    expect(c.pts[0].px).toBe(59.5);   // fresh trade
    expect(c.pts[1].px).toBe(61.2);   // stale trade → last settlement
    expect(c.pts[0].wk).toBe(57);     // six settlements back from the last
  });
});

describe('curveStats', () => {
  const pts = (vals: number[]) => vals.map((px, i) => ({ sym: '', label: `${['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]} ${i ? 27 : 26}`, px, wk: i === 0 ? px * 0.9 : null }));
  it('compares the front with the same month a year out', () => {
    const up = curveStats({ key: 'x', label: '', unit: '', dp: 2, pts: pts([60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 63]) });
    expect(up.far?.label).toBe('Dec 27');
    expect(up.spread).toBeCloseTo(5);
    expect(up.shape).toBe('contango');
    expect(up.frontChg).toBeCloseTo(11.11, 1);
    expect(curveStats({ key: 'x', label: '', unit: '', dp: 2, pts: pts([60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48]) }).shape).toBe('backwardation');
    expect(curveStats({ key: 'x', label: '', unit: '', dp: 2, pts: pts([60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60.2]) }).shape).toBe('flat');
  });
});

describe('fiveYear', () => {
  it('builds the same-week band from the five previous years', () => {
    const s: { d: string; v: number }[] = [];
    for (let y = 2020; y <= 2026; y++) for (let w = 0; w < 52; w++) {
      const d = new Date(Date.UTC(y, 0, 3 + w * 7)).toISOString().slice(0, 10);
      if (y === 2026 && w > 45) break;
      s.push({ d, v: 100 + (y - 2020) * 10 + w * 0.1 });
    }
    const f = fiveYear(s)!;
    expect(f.year).toBe(2026);
    const ref = f.ref!;
    expect(ref.min).toBeCloseTo(110 + ref.w * 0.1 - 0.1, 0);
    expect(ref.max).toBeCloseTo(150 + ref.w * 0.1 - 0.1, 0);
    expect(f.vsAvg).toBeCloseTo(30, 0);
    expect(f.weekly).toBeCloseTo(0.1);
    expect(f.yoy).toBeCloseTo(10, 0);
    expect(fiveYear([])).toBeNull();
  });
});

describe('weekly / pair / correlation', () => {
  it('keeps the last day of each week and pairs Monday-dated bars with Friday readings', () => {
    expect(weekly([{ d: '2026-11-09', v: 1 }, { d: '2026-11-12', v: 2 }, { d: '2026-11-13', v: 3 }, { d: '2026-11-16', v: 4 }])).toEqual([{ d: '2026-11-13', v: 3 }, { d: '2026-11-16', v: 4 }]);
    expect(pair([{ d: '2026-11-09', v: 10 }, { d: '2026-11-16', v: 11 }], [{ d: '2026-11-13', v: 2 }])).toEqual([{ d: '2026-11-09', a: 10, b: 2 }]);
  });
  it('correlates weekly changes', () => {
    const p = Array.from({ length: 60 }, (_, i) => ({ a: 100 * (1 + 0.01 * Math.sin(i)) , b: -Math.sin(i) }));
    expect(changeCorr(p)!).toBeLessThan(-0.95);
    expect(changeCorr(p.slice(0, 10))).toBeNull();
    expect(pctile([1, 2, 3, 4])).toBe(75);
  });
});
