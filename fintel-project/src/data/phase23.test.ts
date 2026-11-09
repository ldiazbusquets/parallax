import { describe, expect, it } from 'vitest';
import { parseBuba, parseEcb, parseFFCalendar, parseRba, parseTable, parseValet, toIso } from './global';
import { parseNasdaqScreener, parseShortVolume, recScore, recLabel, shapeShortInterest } from './equity';
import { parseChart, windowBars } from './yahoo';

describe('economic calendar', () => {
  it('parses the Forex Factory feed and drops malformed rows', () => {
    const ev = parseFFCalendar([
      { title: 'CPI m/m', country: 'USD', date: '2026-11-12T08:30:00-05:00', impact: 'High', forecast: '0.3%', previous: '0.4%' },
      { title: 'Bank Holiday', country: 'JPY', date: '2026-11-03T00:00:00-05:00', impact: 'Holiday', forecast: '', previous: '' },
      { title: 'Broken', country: 'EUR', date: 'not a date', impact: 'High' },
      { title: 'Unknown impact', country: 'EUR', date: '2026-11-10T04:00:00-05:00', impact: 'Huge' },
    ]);
    expect(ev.map((e) => e.title)).toEqual(['Bank Holiday', 'CPI m/m']);
    expect(ev[1]).toMatchObject({ cur: 'USD', impact: 'High', forecast: '0.3%', previous: '0.4%', t: Date.parse('2026-11-12T13:30:00Z') });
  });
  it('rejects a non-array response', () => { expect(() => parseFFCalendar({ error: 'x' })).toThrow(); });
});

describe('government yield parsers', () => {
  it('reads dates in each issuer format', () => {
    expect(toIso('2026/11/5')).toBe('2026-11-05');
    expect(toIso('05 Nov 2026')).toBe('2026-11-05');
    expect(toIso('05-Nov-2026')).toBe('2026-11-05');
    expect(toIso('Date')).toBeUndefined();
  });
  it('Bundesbank CSV skips metadata and "." gaps', () => {
    const csv = '"",BBSIS.D.I…,BBSIS…_FLAGS\n"",Term structure…,\nDecimals,2,\nlast update,2026-11-06 13:28:51,\n2026-10-30,3.40,\n2026-10-31,.,No value available\n2026-11-06,3.29,\n';
    expect(parseBuba(csv)).toEqual([{ d: '2026-10-30', v: 3.4 }, { d: '2026-11-06', v: 3.29 }]);
  });
  it('ECB csvdata finds the columns by name', () => {
    const csv = 'KEY,FREQ,TIME_PERIOD,OBS_VALUE,OBS_STATUS\nYC.B.U2,B,2026-11-04,3.9452974743,A\nYC.B.U2,B,2026-11-05,3.8968282955,A';
    expect(parseEcb(csv)).toEqual([{ d: '2026-11-04', v: 3.9452974743 }, { d: '2026-11-05', v: 3.8968282955 }]);
  });
  it('Bank of Canada Valet JSON', () => {
    expect(parseValet({ observations: [{ d: '2026-11-03', 'BD.CDN.10YR.DQ.YLD': { v: '3.77' } }, { d: '2026-11-04', 'BD.CDN.10YR.DQ.YLD': { v: '' } }] }, 'BD.CDN.10YR.DQ.YLD'))
      .toEqual([{ d: '2026-11-03', v: 3.77 }]);
  });
  it('Bank of England and MOF tables by header column', () => {
    expect(parseTable('DATE,IUDMNZC,IUDSNZC\n30 Oct 2026,5.2767,4.8961\n03 Nov 2026,5.2314,4.8493\n', 'IUDMNZC')).toEqual([{ d: '2026-10-30', v: 5.2767 }, { d: '2026-11-03', v: 5.2314 }]);
    const mof = 'Interest Rate,,,\nDate,1Y,2Y,10Y,40Y\n2026/11/4,0.8,1.0,1.75,3.3\n2026/11/5,0.81,-,1.78,3.31\n';
    expect(parseTable(mof, '10Y', '2026-11-01')).toEqual([{ d: '2026-11-04', v: 1.75 }, { d: '2026-11-05', v: 1.78 }]);
  });
  it('RBA tables by series ID', () => {
    const csv = 'F2 CAPITAL MARKET YIELDS,,\nTitle,2 yr,10 yr\nSeries ID,FCMYGBAG2D,FCMYGBAG10D\n04-Nov-2026,3.70,4.40\n05-Nov-2026,3.72,\n';
    expect(parseRba(csv, 'FCMYGBAG10D')).toEqual([{ d: '2026-11-04', v: 4.4 }]);
  });
  it('throws rather than inventing data when nothing parses', () => {
    expect(() => parseBuba('nothing here')).toThrow();
    expect(() => parseTable('a,b\n1,2', '10Y')).toThrow();
  });
});

describe('screener, ratings and shorts', () => {
  it('parses Nasdaq screener rows', () => {
    const rows = parseNasdaqScreener({ data: { rows: [
      { symbol: 'A', name: 'Agilent Technologies Inc. Common Stock', lastsale: '$171.66', pctchange: '-3.11%', volume: '1900601', marketCap: '48395907078.00', country: 'United States', industry: 'Biotech', sector: 'Industrials' },
      { symbol: 'ZZZ', name: 'No price', lastsale: '', pctchange: '', volume: '', marketCap: '' },
    ] } });
    expect(rows).toEqual([{ s: 'A', n: 'Agilent Technologies Inc.', p: 171.66, ch: -3.11, mc: 48395907078, v: 1900601, sec: 'Industrials', ind: 'Biotech', cty: 'United States' }]);
  });
  it('consensus score and label', () => {
    const r = { period: '2026-11-01', sb: 10, b: 20, h: 10, s: 0, ss: 0 };
    expect(recScore(r)).toBeCloseTo(2);
    expect(recLabel(recScore(r))).toBe('Buy');
    expect(recScore({ period: 'x', sb: 0, b: 0, h: 0, s: 0, ss: 0 })).toBeNull();
  });
  it('keeps the latest settlement per symbol and computes days to cover', () => {
    const s = shapeShortInterest([
      { symbolCode: 'PLTR', settlementDate: '2026-10-15', currentShortPositionQuantity: 50e6, previousShortPositionQuantity: 40e6, averageDailyVolumeQuantity: 25e6 },
      { symbolCode: 'PLTR', settlementDate: '2026-10-31', currentShortPositionQuantity: 60e6, previousShortPositionQuantity: 50e6, averageDailyVolumeQuantity: 30e6 },
    ]);
    expect(s.PLTR).toMatchObject({ date: '2026-10-31', short: 60e6, prev: 50e6, adv: 30e6, dtc: 2 });
    expect(s.PLTR.chgPct).toBeCloseTo(20);
  });
  it('parses FINRA daily short volume', () => {
    const v = parseShortVolume('Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market\r\n20261106|AA|904957.12|1393|2151713.08|B,Q,N\r\n20261106|ZERO|0|0|0|Q\r\n12292\r\n');
    expect(v.date).toBe('2026-11-06');
    expect(Object.keys(v.rows)).toEqual(['AA']);
    expect(() => parseShortVolume('<html>')).toThrow();
  });
});

describe('OHLC bars', () => {
  const j = { chart: { error: null, result: [{ meta: { symbol: 'X', chartPreviousClose: 9 }, timestamp: [1, 2, 3], indicators: { quote: [{ open: [10, 11, null], high: [12, 12, 13], low: [9, 10, 11], close: [11, 11.5, 12], volume: [100, 200, 300] }] } }] } };
  it('keeps OHLC only when every bar is complete', () => {
    expect(parseChart(j as never).o).toBeUndefined();
    const full = JSON.parse(JSON.stringify(j)); full.chart.result[0].indicators.quote[0].open[2] = 11.5;
    const b = parseChart(full);
    expect(b.o).toEqual([10, 11, 11.5]);
    expect(b.h).toEqual([12, 12, 13]);
    expect(windowBars(b, 2)).toMatchObject({ c: [11.5, 12], o: [11, 11.5], prevClose: 11 });
  });
});

import { parseEonetFires, parseGdacs, parseUsgs } from './hazards';
describe('natural hazards', () => {
  it('keeps significant, M6+ or tsunami-flagged quakes once', () => {
    const f = (id: string, mag: number, tsunami = 0, alert: string | null = null) => ({ id, properties: { mag, place: 'Somewhere', time: 1, url: 'u', alert, tsunami, sig: 0, title: '' }, geometry: { coordinates: [140, 38, 10] } });
    const h = parseUsgs([{ features: [f('a', 5.1), f('b', 6.4), f('c', 5.0, 1)] }, { features: [f('b', 6.4), f('d', 4.9)] }], new Set(['d']));
    expect(h.map((x) => [x.id, x.kind]).sort()).toEqual([['usgs:b', 'quake'], ['usgs:c', 'tsunami'], ['usgs:d', 'quake']]);
  });
  it('keeps Orange/Red GDACS alerts with a point location', () => {
    const g = (eventtype: string, alertlevel: string) => ({ geometry: { type: 'Point', coordinates: [80, 15] }, properties: { eventtype, eventid: 1, name: 'Tropical Cyclone X-26', alertlevel, iso3: 'IND', country: 'India', fromdate: '2026-11-01T00:00:00', severitydata: { severitytext: 'Hurricane/Typhoon > 74 mph' } } });
    const h = parseGdacs({ features: [g('TC', 'Red'), g('FL', 'Green'), g('EQ', 'Red')] });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ kind: 'cyclone', level: 'red', iso3: 'IND', t: Date.UTC(2026, 10, 1) });
  });
  it('keeps large wildfires and skips prescribed burns', () => {
    const e = (title: string, acres: number) => ({ id: title, title, description: null, link: 'l', geometry: [{ date: '2026-11-02T00:00:00Z', type: 'Point', coordinates: [-120, 37], magnitudeValue: acres, magnitudeUnit: 'acres' }] });
    const h = parseEonetFires({ events: [e('Wildfire Big Creek, Fresno, California', 25000), e('Prescribed Fire Piles RX, Coconino, Arizona', 3000), e('Wildfire Small, X', 200)] });
    expect(h.map((x) => [x.title, x.level])).toEqual([['Big Creek, Fresno, California fire', 'orange']]);
  });
});
