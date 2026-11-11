import { describe, expect, it } from 'vitest';
import { buildHolders, latestStakes, parseStake, type CompanyData } from './company';
import { holdersOf, parseInfoTable, shapeHoldings, type FundsData } from './funds';
import { seasonStats, type EarningsEvent } from './sources';
import { topCompanies, type ScreenRow } from './equity';

// shapes copied from real EDGAR files (Nov 2026): 13G uses an sch: prefix, 13D a default namespace
const G13 = `<?xml version="1.0"?><sch:edgarSubmission xmlns:sch="http://www.sec.gov/edgar/schedule13g"><sch:headerData><sch:submissionType>SCHEDULE 13G/A</sch:submissionType></sch:headerData>
<sch:formData><sch:coverPageHeader><sch:eventDateRequiresFilingThisStatement>09/30/2026</sch:eventDateRequiresFilingThisStatement><sch:issuerInfo><sch:issuerCik>0000320193</sch:issuerCik><sch:issuerName>Apple Inc.</sch:issuerName></sch:issuerInfo></sch:coverPageHeader>
<sch:coverPageHeaderReportingPersonDetails><sch:reportingPersonName>VANGUARD GROUP INC</sch:reportingPersonName><sch:reportingPersonBeneficiallyOwnedAggregateNumberOfShares>1400000000.00</sch:reportingPersonBeneficiallyOwnedAggregateNumberOfShares><sch:classPercent>9.4</sch:classPercent></sch:coverPageHeaderReportingPersonDetails></sch:formData></sch:edgarSubmission>`;
const D13 = `<edgarSubmission xmlns="http://www.sec.gov/edgar/schedule13D"><headerData><submissionType>SCHEDULE 13D</submissionType></headerData><formData><coverPageHeader><dateOfEvent>11/07/2025</dateOfEvent>
<issuerInfo><issuerCIK>0000317540</issuerCIK><issuerName>Coca-Cola Consolidated, Inc.</issuerName></issuerInfo></coverPageHeader><reportingPersons>
<reportingPersonInfo><reportingPersonCIK>0000021344</reportingPersonCIK><reportingPersonName>THE COCA-COLA COMPANY</reportingPersonName><aggregateAmountOwned>2000000</aggregateAmountOwned><percentOfClass>21.5</percentOfClass></reportingPersonInfo>
<reportingPersonInfo><reportingPersonName>CCBCC HOLDINGS INC</reportingPersonName><aggregateAmountOwned>900000</aggregateAmountOwned><percentOfClass>9.8</percentOfClass></reportingPersonInfo></reportingPersons></formData></edgarSubmission>`;

describe('13D / 13G', () => {
  it('reads the prefixed 13G format', () => {
    const s = parseStake(G13, '0000320193', '2026-10-15', 'L')!;
    expect(s).toMatchObject({ form: '13G', amended: true, event: '2026-09-30', pct: 9.4, shares: 1.4e9, filer: 'VANGUARD GROUP INC' });
  });
  it('reads the 13D format and keeps the group’s largest stake', () => {
    const s = parseStake(D13, '317540', '2025-11-10', 'L')!;
    expect(s).toMatchObject({ form: '13D', amended: false, event: '2025-11-07', pct: 21.5, shares: 2e6 });
  });
  it('ignores statements about another issuer (the company as filer)', () => {
    expect(parseStake(D13, '0000021344', '2025-11-10', 'L')).toBeNull();
  });
  it('keeps the latest statement per filer, biggest first', () => {
    const a = parseStake(G13, '320193', '2026-01-01', 'a')!, b = { ...a, filed: '2026-10-15', pct: 8.1 }, c = { ...a, filer: 'BLACKROCK', pct: 6.5 };
    expect(latestStakes([a, b, c]).map((x) => [x.filer, x.pct])).toEqual([['VANGUARD GROUP INC', 8.1], ['BLACKROCK', 6.5]]);
  });
});

const INFO = `<informationTable><infoTable><nameOfIssuer>ALLY FINL INC</nameOfIssuer><cusip>02005N100</cusip><value>577</value><shrsOrPrnAmt><sshPrnamt>12</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
<infoTable><nameOfIssuer>ALLY FINL INC</nameOfIssuer><cusip>02005N100</cusip><value>128</value><shrsOrPrnAmt><sshPrnamt>3</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
<infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip><value>1000</value><shrsOrPrnAmt><sshPrnamt>5</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
<infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip><value>50</value><shrsOrPrnAmt><sshPrnamt>1</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>Put</putCall></infoTable></informationTable>`;

describe('13F', () => {
  it('sums managers per CUSIP and drops options', () => {
    expect(parseInfoTable(INFO)).toEqual([{ cusip: '037833100', issuer: 'APPLE INC', value: 1000, shares: 5 }, { cusip: '02005N100', issuer: 'ALLY FINL INC', value: 705, shares: 15 }]);
  });
  it('weights, tickers and reverse lookup', () => {
    const { total, holdings } = shapeHoldings(parseInfoTable(INFO), { '037833100': 'AAPL', '02005N100': 'ALLY' });
    expect(total).toBe(1705);
    expect(holdings[0].pct).toBeCloseTo(58.65, 1);
    const d: FundsData = { funds: [{ cik: '1', name: 'F', style: 'value', period: '2026-06-30', filed: '2026-08-14', total, positions: 2, holdings, link: '' }], errors: [] };
    expect(holdersOf(d, 'ally')[0].h.value).toBe(705);
    const co = (t: string, stakes: CompanyData['stakes'] = []) => ({ ticker: t, stakes } as CompanyData);
    const st = parseStake(D13, '317540', '2025-11-10', 'L')!;
    const hs = buildHolders([co('AAPL'), co('COKE', [st])], d);
    expect(hs.map((h) => [h.kind, h.links.map((l) => l.ticker).join()])).toEqual([['fund', 'AAPL'], ['13D', 'COKE']]);
  });
});

describe('largest companies', () => {
  const r = (s: string, n: string, mc: number): ScreenRow => ({ s, n, p: 1, ch: 0, mc, v: 1, sec: '', ind: '', cty: '' });
  it('merges share classes and drops preferreds', () => {
    const rows = [r('GOOG', 'Alphabet Inc. Class C Capital Stock', 3e12), r('GOOGL', 'Alphabet Inc. Class A Common Stock', 3.1e12), r('AAPL', 'Apple Inc.', 4e12), r('JPM-PC', 'JPMorgan 6% Preferred', 5e12)];
    expect(topCompanies(rows, 5).map((x) => x.s)).toEqual(['AAPL', 'GOOGL']);
  });
});

describe('earnings season', () => {
  const e = (symbol: string, date: string, epsAct: number, epsEst: number, revAct: number | null = null, revEst: number | null = null): EarningsEvent => ({ symbol, date, hour: '', epsAct, epsEst, revAct, revEst });
  it('beat rate overall and for the largest, by week', () => {
    const rows = [e('AAPL', '2026-10-30', 1.2, 1.0, 10, 9), e('AAPL', '2026-10-30', 1.2, 1.0), e('MSFT', '2026-10-29', 2.0, 2.1, 5, 6), e('XYZ', '2026-11-03', 0.5, 0.5), e('BRK.B', '2026-11-03', 3, 2)];
    const s = seasonStats(rows, new Set(['AAPL', 'MSFT', 'BRKB']), '2026-08-10', '2026-11-09');
    expect(s.all).toMatchObject({ n: 4, beat: 2, miss: 1, inline: 1 });
    expect(s.large).toMatchObject({ n: 3, beat: 2, revN: 2, revBeat: 1 });
    expect(s.weeks).toEqual([{ wk: '2026-10-26', n: 2, beat: 1 }, { wk: '2026-11-02', n: 1, beat: 1 }]);
    expect(s.beats[0].symbol).toBe('BRK.B');
    expect(s.misses[0].symbol).toBe('MSFT');
  });
});

import { cargoFrom, chokeRisk, km, portWeek, shapePorts } from './trade';
describe('trade flows', () => {
  it('ports: shape and 7-day average', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ portid: 'p1', date: `2026-10-${String(23 + i).padStart(2, '0')}`, portcalls: 100 + i, import: 10, export: 5 }));
    const d = shapePorts([{ portid: 'p1', portname: 'Singapore', country: 'Singapore', ISO3: 'SGP', lat: 1.27, lon: 103.7, vessel_count_total: 44369, vessel_count_container: 1, vessel_count_tanker: 2 }], rows);
    expect(d.last).toBe('2026-10-30');
    expect(portWeek(d.daily.p1, d.last)).toBeCloseTo(104, 5);
    expect(portWeek(d.daily.p1, d.last, 'imp')).toBe(10);
    expect(portWeek(d.daily.p1, '2026-10-24')).toBeNull();
  });
  it('cargo: only cargo-airline callsigns, each aircraft once', () => {
    const seen = new Set<string>();
    const ac = [{ hex: 'a', flight: 'FDX1230 ', lat: 35, lon: -90, alt_baro: 2600, track: 129 }, { hex: 'b', flight: 'SWA2717', lat: 35, lon: -90 }, { hex: 'c', flight: 'UPS9324', lat: 35, lon: -90, alt_baro: 'ground' as const }, { hex: 'd', flight: 'FDXFAKE', lat: 1, lon: 1 }];
    const p = cargoFrom('MEM', ac, seen);
    expect(p.map((x) => [x.cs, x.op, x.ground])).toEqual([['FDX1230', 'FedEx', false], ['UPS9324', 'UPS', true]]);
    expect(cargoFrom('SDF', ac, seen)).toEqual([]);
  });
  it('chokepoint risk: nearby, located events and alerted hazards only', () => {
    expect(km({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.2, 0);
    const bab = { id: 'c1', name: 'Bab el-Mandeb', lat: 12.6, lng: 43.3, annual: 1, topIndustries: [] };
    const ev = (place: string, lat: number, lng: number, cat: 'conflict' | 'unrest' | 'sanctions', n: number) => ({ lat, lng, cat, n, m: n, place, fips: 'YM', last: 0, code: '190', url: '' });
    const r = chokeRisk([bab], [ev('Aden, Adan, Yemen', 12.78, 45.04, 'conflict', 7), ev('Yemen', 15.5, 47.5, 'conflict', 40), ev('Cairo, Egypt', 30, 31.2, 'unrest', 3)],
      [{ id: 'h', kind: 'cyclone', title: 'TC X', detail: '', lat: 13, lng: 44, t: 0, level: 'orange', src: 'GDACS', url: '' }, { id: 'g', kind: 'quake', title: 'M5', detail: '', lat: 13, lng: 44, t: 0, level: null, src: 'USGS', url: '' }]);
    expect(r[0]).toMatchObject({ conflict: 7, unrest: 0, places: ['Aden'] });
    expect(chokeRisk([bab], [{ ...ev('Aden, Adan, Yemen', 12.78, 45.04, 'conflict', 9), code: '138' }], [])[0].conflict).toBe(0);
    expect(r[0].hazards.map((h) => h.id)).toEqual(['h']);
  });
});

import { tickerByName } from './funds';
describe('13F issuer names', () => {
  it('matches an abbreviated issuer to one listed company', () => {
    const rows = [{ s: 'JHG', n: 'Janus Henderson Group plc' }, { s: 'GOOGL', n: 'Alphabet Inc.' }, { s: 'GOOG', n: 'Alphabet Inc.' }, { s: 'AA', n: 'Alcoa Corporation' }];
    expect(tickerByName('JANUS HENDERSON GROUP PLC', rows)).toBe('JHG');
    expect(tickerByName('ALPHABET INC', rows)).toBeNull(); // two share classes: ambiguous
    expect(tickerByName('ALCOA CORP', rows)).toBe('AA');
  });
});

import { freshenRows } from './equity';
describe('screener prices', () => {
  it('takes price and change from a Yahoo quote and rescales market value', () => {
    const rows = [{ s: 'BRK/B', n: 'Berkshire', p: 100, ch: 2, mc: 1000, v: 1, sec: '', ind: '', cty: '' }, { s: 'XYZ', n: 'X', p: 5, ch: 1, mc: 10, v: 1, sec: '', ind: '', cty: '' }];
    const q = { 'BRK-B': { symbol: 'BRK-B', name: '', price: 90, prev: 100, change: -10, changePct: -10, time: 5, currency: 'USD', spark: [] } };
    expect(freshenRows(rows, q)).toEqual([{ ...rows[0], p: 90, ch: -10, mc: 900, t: 5 }, rows[1]]);
  });
});
