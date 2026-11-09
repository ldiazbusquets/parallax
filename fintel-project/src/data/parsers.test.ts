import { describe, expect, it } from 'vitest';
import { parseFredCsv, yoy, yoySeries, diffSeries, atOrBefore } from './fred';
import { parseSpark, parseChart } from './yahoo';
import { cotRows, toAuction, tone } from './sources';

describe('FRED CSV', () => {
  const csv = 'observation_date,UNRATE\n2025-08-01,4.3\n2025-09-01,4.4\n2025-10-01,\n2025-11-01,4.5\n2025-12-01,.\n';
  it('skips blank and "." observations instead of treating them as zero', () => {
    expect(parseFredCsv(csv)).toEqual([{ d: '2025-08-01', v: 4.3 }, { d: '2025-09-01', v: 4.4 }, { d: '2025-11-01', v: 4.5 }]);
  });
  it('computes year-over-year against the same month a year earlier', () => {
    const s = Array.from({ length: 14 }, (_, i) => ({ d: `${2025 + Math.floor((i + 8) / 12)}-${String(((i + 8) % 12) + 1).padStart(2, '0')}-01`, v: 100 + i }));
    const r = yoy(s)!;
    expect(r.d).toBe(s[13].d);
    expect(r.v).toBeCloseTo((113 / 101 - 1) * 100, 6);
    expect(yoySeries(s, 2).length).toBe(2);
  });
  it('returns no YoY when the year-earlier month is missing', () => {
    expect(yoy([{ d: '2026-01-01', v: 1 }])).toBeUndefined();
  });
  it('diffs and looks up by date', () => {
    const s = [{ d: '2026-01-01', v: 10 }, { d: '2026-02-01', v: 13 }];
    expect(diffSeries(s)).toEqual([{ d: '2026-02-01', v: 3 }]);
    expect(atOrBefore(s, '2026-01-20')?.v).toBe(10);
    expect(atOrBefore(s, '2025-12-31')).toBeUndefined();
  });
});

describe('Yahoo', () => {
  const sparkJson = { spark: { error: null, result: [
    { symbol: 'SPY', response: [{ meta: { symbol: 'SPY', shortName: 'SPDR S&P 500', currency: 'USD', regularMarketPrice: 736.25, previousClose: 733, chartPreviousClose: 733, regularMarketTime: 1793988070, fiftyTwoWeekHigh: 781.62, fiftyTwoWeekLow: 629.28 }, timestamp: [1, 2, 3], indicators: { quote: [{ close: [734, null, 736.25] }] } }] },
    { symbol: 'BAD', response: [{ meta: { symbol: 'BAD' } }] },
  ] } };
  it('parses spark quotes and daily change vs previous close', () => {
    const q = parseSpark(sparkJson as never);
    expect(Object.keys(q)).toEqual(['SPY']);
    expect(q.SPY.change).toBeCloseTo(3.25);
    expect(q.SPY.changePct).toBeCloseTo((3.25 / 733) * 100);
    expect(q.SPY.spark).toEqual([734, 736.25]);
    expect(q.SPY.time).toBe(1793988070000);
  });
  it('parses chart bars and drops null closes', () => {
    const b = parseChart({ chart: { error: null, result: [{ meta: { symbol: 'X', chartPreviousClose: 9 }, timestamp: [10, 20, 30], indicators: { quote: [{ close: [1, null, 3] }] } }] } } as never);
    expect(b.t).toEqual([10000, 30000]);
    expect(b.c).toEqual([1, 3]);
  });
  it('throws a readable error for unknown symbols', () => {
    expect(() => parseChart({ chart: { result: null, error: { description: 'No data found, symbol may be delisted' } } } as never)).toThrow(/delisted/);
  });
});

describe('Treasury & CFTC', () => {
  it('uses high yield for coupons and investment rate for bills', () => {
    expect(toAuction({ security_type: 'Note', security_term: '10-Year', auction_date: '2026-10-08', issue_date: '', cusip: 'a', high_yield: '4.512', high_discnt_rate: null, high_investment_rate: null, bid_to_cover_ratio: '2.61', offering_amt: '39000000000', reopening: 'No' }))
      .toMatchObject({ rate: 4.512, rateKind: 'yield', btc: 2.61 });
    expect(toAuction({ security_type: 'Bill', security_term: '4-Week', auction_date: '2026-10-15', issue_date: '', cusip: 'b', high_yield: 'null', high_discnt_rate: '4.000000', high_investment_rate: '4.068000', bid_to_cover_ratio: '2.56', offering_amt: null, reopening: 'Yes' }))
      .toMatchObject({ rate: 4.068, rateKind: 'discount', reopening: true });
  });
  it('computes speculative net, weekly change and percentile', () => {
    const rows = [3, 1, 2].map((k, i) => ({ cftc_contract_market_code: '088691', report_date_as_yyyy_mm_dd: `2026-10-0${i + 1}T00:00:00.000`, open_interest_all: '1000', m_money_positions_long_all: String(100 * k), m_money_positions_short_all: '50' }));
    const [g] = cotRows(rows, 'dis');
    expect(g.market.label).toBe('Gold');
    expect(g.net).toBe(150);
    expect(g.change).toBe(100); // nets 250, 50, 150
    expect(g.netPctOi).toBeCloseTo(15);
    expect(g.pctile).toBeNull(); // fewer than 20 weeks: no percentile
  });
});

describe('headline tone', () => {
  it('scores words, clamped to -1..1', () => {
    expect(tone('Stocks rally to record as inflation cools')).toBe(1);
    expect(tone('Shares plunge on recession fears')).toBe(-1);
    expect(tone('Fed holds rates steady')).toBe(0);
  });
});

describe('store', () => {
  it('re-runs a source that was requested while a fetch was in flight, and keeps data when a refresh fails', async () => {
    const { register, run, stateOf } = await import('./store');
    let calls = 0, fail = false;
    register({ id: 'test:again', label: 't', provider: 'p', every: 1e9, fetch: async () => { calls++; await new Promise((r) => setTimeout(r, 5)); if (fail) throw new Error('boom'); return calls; } });
    const first = run('test:again');
    void run('test:again');            // requested mid-flight: must not be dropped
    await first;
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toBe(2);
    expect(stateOf<number>('test:again')).toMatchObject({ status: 'live', data: 2 });
    fail = true;
    await run('test:again');
    expect(stateOf<number>('test:again')).toMatchObject({ status: 'stale', data: 2, error: 'boom' });
  });
});

import { parseBisPolicy, shapeImf } from './sources';
describe('parseBisPolicy', () => {
  const csv = ['DATAFLOW,FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE',
    'BIS:WS_CBPOL(1.0),D,JP,2025-10-01,0.5,', 'BIS:WS_CBPOL(1.0),D,JP,2026-09-18,1.25,', 'BIS:WS_CBPOL(1.0),D,JP,2026-09-17,1,',
    'BIS:WS_CBPOL(1.0),D,JP,2026-11-05,1.25,', 'BIS:WS_CBPOL(1.0),D,GB,2026-11-05,3.75,', 'BIS:WS_CBPOL(1.0),D,GB,2026-11-04,,'].join('\n');
  const r = parseBisPolicy(csv, '2025-11-05');
  it('takes the latest value, the last move and the year-ago level', () => {
    expect(r.JP).toEqual({ area: 'JP', v: 1.25, d: '2026-11-05', prev: 1, changed: '2026-09-18', y1: 0.5 });
  });
  it('skips blanks and leaves unknown history undefined', () => {
    expect(r.GB.v).toBe(3.75); expect(r.GB.prev).toBeUndefined(); expect(r.GB.y1).toBeUndefined();
  });
});

describe('shapeImf', () => {
  it('keeps only the requested years and numeric values, keyed by country then indicator', () => {
    const r = shapeImf({ NGDP_RPCH: { USA: { '2024': 3, '2025': 2.3, '2026': 2.3, '2030': 1.8 }, CHN: { '2025': null as unknown as number } } }, [2025, 2026], 'WEO (October 2026)');
    expect(r.data).toEqual({ USA: { NGDP_RPCH: { '2025': 2.3, '2026': 2.3 } } });
    expect(r.edition).toBe('WEO (October 2026)');
  });
});

import { categorise, cameoLabel, parseGdeltExport, summariseEvents } from './events';
describe('GDELT events', () => {
  const row = (o: Record<number, string>) => { const f = Array(61).fill(''); for (const [k, v] of Object.entries(o)) f[+k] = v; return f.join('\t'); };
  const base = { 1: '20261106', 6: 'ISRAEL', 7: 'ISR', 12: 'MIL', 16: 'HAMAS', 17: 'PSE', 26: '195', 28: '19', 31: '12', 32: '4', 52: 'Gaza, Gaza Strip', 53: 'IS', 56: '31.5', 57: '34.47', 59: '20261107000000', 60: 'https://example.com/a' };
  it('categorises CAMEO root codes', () => {
    expect(categorise('19', '195')).toBe('conflict'); expect(categorise('18', '183')).toBe('conflict'); expect(categorise('15', '152')).toBe('conflict');
    expect(categorise('14', '143')).toBe('unrest'); expect(categorise('16', '1631')).toBe('sanctions');
    // dropped: ordinary demonstrations, street assaults, arrests, unrelated codes
    expect(categorise('14', '141')).toBeNull(); expect(categorise('18', '182')).toBeNull(); expect(categorise('17', '173')).toBeNull(); expect(categorise('04', '040')).toBeNull();
    expect(cameoLabel('195')).toBe('Air strikes'); expect(cameoLabel('1412')).toBe('Demonstration or rally');
  });
  it('keeps geolocated, recent, well-covered events only', () => {
    const tsv = [row(base), row({ ...base, 31: '1' }), row({ ...base, 56: '', 57: '' }), row({ ...base, 1: '20250101' }), row({ ...base, 28: '04', 26: '040' })].join('\n');
    const evs = parseGdeltExport(tsv);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toEqual([Date.UTC(2026, 10, 7), 'conflict', '195', 31.5, 34.47, 'Gaza, Gaza Strip', 'IS', 'ISRAEL', 'HAMAS', 12, 4, 'https://example.com/a']);
  });
  it('summarises points, de-duplicated top events and per-country counts', () => {
    const e = parseGdeltExport([row(base), row({ ...base, 26: '193', 31: '5' }), row({ ...base, 26: '143', 28: '14', 53: 'US', 60: 'https://example.com/b' }),
      row({ ...base, 26: '190', 31: '2', 32: '1', 60: 'https://example.com/c' })].join('\n')); // last: one source, 2 mentions → not important
    const s = summariseEvents(e);
    expect(s.total).toBe(3);
    expect(s.byCat).toEqual({ conflict: 2, unrest: 1, sanctions: 0 });
    expect(s.top.map((x) => x.label)).toEqual(['Air strikes', 'Strike or boycott']); // same article coded twice → once
    expect(s.byCountry.IS.n).toBe(2);
    expect(s.points.find((p) => p.cat === 'conflict')?.n).toBe(2);
  });
  it('drops violence that is crime rather than war (no armed actor, armed group or second country)', () => {
    const crime = row({ ...base, 7: 'USA', 12: 'COP', 16: 'GUNMAN', 17: 'USA', 18: '', 22: 'CRM', 26: '193', 53: 'US' });
    const war = row({ ...base, 7: 'RUS', 12: 'MIL', 17: 'UKR', 18: '', 22: '', 53: 'UP' });
    const gunman = row({ ...base, 7: '', 12: 'UAF', 17: 'USA', 22: '', 26: '193', 53: 'US' });
    const tourist = row({ ...base, 5: 'GBRCVL', 7: 'GBR', 12: 'CVL', 15: 'POLCOP', 17: 'POL', 22: 'COP', 26: '193', 53: 'PL' });
    const states = row({ ...base, 5: 'RUS', 7: 'RUS', 12: '', 15: 'UKR', 17: 'UKR', 22: '', 26: '195', 53: 'UP' });
    const strike = row({ ...base, 7: 'FRA', 12: 'LAB', 16: '', 18: '', 26: '143', 28: '14', 53: 'FR' });
    expect(parseGdeltExport([crime, war, gunman, tourist, states, strike].join('\n')).map((e) => [e[1], e[6]])).toEqual([['conflict', 'UP'], ['conflict', 'UP'], ['unrest', 'FR']]);
  });
  it('re-applies current categories to events cached under the old rules', () => {
    const old = [Date.UTC(2026, 10, 7), 'protest', '141', 1, 1, 'X', 'US', '', '', 30, 5, 'u'] as unknown as Parameters<typeof summariseEvents>[0][number];
    const strike = [Date.UTC(2026, 10, 7), 'protest', '143', 1, 1, 'X', 'US', '', '', 30, 5, 'v'] as unknown as Parameters<typeof summariseEvents>[0][number];
    expect(summariseEvents([old, strike]).byCat).toEqual({ conflict: 0, unrest: 1, sanctions: 0 });
  });
});
