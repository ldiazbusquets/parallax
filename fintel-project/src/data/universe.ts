// What the terminal tracks. Symbols are Yahoo Finance tickers. These are lists of instruments, not data.

export type Inst = [symbol: string, label: string];

export const TAPE: Inst[] = [
  ['ES=F', 'S&P FUT'], ['NQ=F', 'NDX FUT'], ['YM=F', 'DOW FUT'], ['RTY=F', 'R2K FUT'], ['^VIX', 'VIX'], ['^TNX', 'US 10Y'],
  ['DX-Y.NYB', 'DXY'], ['EURUSD=X', 'EUR/USD'], ['JPY=X', 'USD/JPY'], ['CL=F', 'WTI'], ['GC=F', 'GOLD'], ['HG=F', 'COPPER'], ['BTC-USD', 'BITCOIN'], ['ETH-USD', 'ETHER'],
];

export const INDICES: { region: string; items: Inst[] }[] = [
  { region: 'Americas', items: [['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq Comp.'], ['^DJI', 'Dow Jones'], ['^RUT', 'Russell 2000'], ['^GSPTSE', 'S&P/TSX'], ['^BVSP', 'Bovespa'], ['^MXX', 'IPC Mexico'], ['ARGT', 'Argentina (MSCI ETF)']] },
  { region: 'Europe', items: [['^STOXX', 'STOXX 600'], ['^FTSE', 'FTSE 100'], ['^GDAXI', 'DAX'], ['^FCHI', 'CAC 40'], ['FTSEMIB.MI', 'FTSE MIB'], ['^IBEX', 'IBEX 35'], ['^AEX', 'AEX'], ['^SSMI', 'SMI'], ['^OMX', 'OMX 30'], ['WIG20.WA', 'WIG20']] },
  { region: 'Asia-Pacific', items: [['^N225', 'Nikkei 225'], ['^HSI', 'Hang Seng'], ['000001.SS', 'Shanghai Comp.'], ['^KS11', 'KOSPI'], ['^TWII', 'TAIEX'], ['^BSESN', 'Sensex'], ['^STI', 'STI'], ['^JKSE', 'Jakarta Comp.'], ['^AXJO', 'ASX 200'], ['^NZ50', 'NZX 50']] },
  { region: 'Middle East & Africa', items: [['^TASI.SR', 'Saudi TASI'], ['FADGI.FGI', 'Abu Dhabi ADX'], ['^TA125.TA', 'Tel Aviv 125'], ['XU100.IS', 'BIST 100'], ['^CASE30', 'EGX 30'], ['^J203.JO', 'JSE All Share']] },
];

export const SECTORS: Inst[] = [
  ['XLK', 'Technology'], ['XLC', 'Communication'], ['XLY', 'Cons. Discretionary'], ['XLF', 'Financials'], ['XLV', 'Health Care'],
  ['XLI', 'Industrials'], ['XLP', 'Cons. Staples'], ['XLE', 'Energy'], ['XLU', 'Utilities'], ['XLB', 'Materials'], ['XLRE', 'Real Estate'],
];

export const VOL: [symbol: string, label: string, what: string][] = [
  ['^VIX', 'VIX', 'S&P 500, 30-day implied'], ['^VIX9D', 'VIX 9-day', 'S&P 500, 9-day'], ['^VIX3M', 'VIX 3-month', 'S&P 500, 3-month'],
  ['^VVIX', 'VVIX', 'volatility of VIX'], ['^SKEW', 'SKEW', 'tail-risk pricing'], ['^MOVE', 'MOVE', 'Treasury implied vol'],
  ['^OVX', 'OVX', 'crude oil implied vol'], ['^GVZ', 'GVZ', 'gold implied vol'],
];

export const COMMODITIES: { group: string; items: Inst[] }[] = [
  { group: 'Energy', items: [['CL=F', 'WTI Crude'], ['BZ=F', 'Brent Crude'], ['NG=F', 'Natural Gas'], ['RB=F', 'Gasoline'], ['HO=F', 'Heating Oil']] },
  { group: 'Metals', items: [['GC=F', 'Gold'], ['SI=F', 'Silver'], ['HG=F', 'Copper'], ['PL=F', 'Platinum'], ['PA=F', 'Palladium']] },
  { group: 'Agriculture', items: [['ZC=F', 'Corn'], ['ZW=F', 'Wheat'], ['ZS=F', 'Soybeans'], ['KC=F', 'Coffee'], ['SB=F', 'Sugar'], ['CC=F', 'Cocoa']] },
];

/** invert: Yahoo quotes it as foreign-per-USD; we show it that way and label it. */
export const FX: Inst[] = [
  ['DX-Y.NYB', 'Dollar Index'], ['EURUSD=X', 'EUR/USD'], ['GBPUSD=X', 'GBP/USD'], ['JPY=X', 'USD/JPY'], ['CHF=X', 'USD/CHF'],
  ['CAD=X', 'USD/CAD'], ['AUDUSD=X', 'AUD/USD'], ['CNY=X', 'USD/CNY'], ['MXN=X', 'USD/MXN'], ['INR=X', 'USD/INR'], ['KRW=X', 'USD/KRW'], ['BRL=X', 'USD/BRL'],
];

export const HEATMAP: { sector: string; items: string[] }[] = [
  { sector: 'Technology', items: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'PLTR', 'AMD', 'CRM', 'CSCO', 'ADBE'] },
  { sector: 'Communication', items: ['GOOGL', 'META', 'NFLX', 'DIS', 'T', 'VZ'] },
  { sector: 'Cons. Discretionary', items: ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'NKE'] },
  { sector: 'Financials', items: ['BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS'] },
  { sector: 'Health Care', items: ['LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'PFE'] },
  { sector: 'Industrials', items: ['GE', 'CAT', 'RTX', 'HON', 'UNP', 'BA', 'LMT'] },
  { sector: 'Cons. Staples', items: ['WMT', 'COST', 'PG', 'KO', 'PEP'] },
  { sector: 'Energy', items: ['XOM', 'CVX', 'COP', 'SLB'] },
  { sector: 'Utilities · RE · Materials', items: ['NEE', 'SO', 'PLD', 'AMT', 'LIN', 'FCX'] },
];

export const DEFAULT_WATCHLIST = ['PLTR', 'NVDA', 'MSFT', 'AAPL', 'TSLA', 'SPY', 'QQQ', 'TLT'];

// FOMC meeting dates (second day = decision day), from federalreserve.gov/monetarypolicy/fomccalendars.htm.
export const FOMC_2026 = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];

/** Countries on the map: capital coordinates, World Bank code, main index and currency (Yahoo symbols). */
/** bond: OECD two-letter code for FRED's monthly 10-year government yield (IRLTLT01<code>M156N), where FRED has it. */
export interface Country { iso3: string; name: string; lat: number; lng: number; index?: Inst; fx?: Inst; bond?: string }
/** ISO-2 code used by the BIS (euro-area members share the ECB rate, area XM). */
const EURO = new Set(['DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'AUT', 'BEL', 'FIN', 'IRL', 'PRT', 'GRC']);
const ISO2: Record<string, string> = { USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR', CHL: 'CL', COL: 'CO', PER: 'PE', GBR: 'GB', CHE: 'CH', SWE: 'SE', DNK: 'DK', NOR: 'NO', POL: 'PL', CZE: 'CZ', HUN: 'HU', TUR: 'TR', ISR: 'IL', SAU: 'SA', ARE: 'AE', QAT: 'QA', KWT: 'KW', EGY: 'EG', MAR: 'MA', NGA: 'NG', GHA: 'GH', KEN: 'KE', ZAF: 'ZA', RUS: 'RU', IND: 'IN', PAK: 'PK', BGD: 'BD', CHN: 'CN', HKG: 'HK', JPN: 'JP', KOR: 'KR', TWN: 'TW', SGP: 'SG', IDN: 'ID', THA: 'TH', MYS: 'MY', VNM: 'VN', PHL: 'PH', AUS: 'AU', NZL: 'NZ' };
export const policyArea = (c: Country) => (EURO.has(c.iso3) ? 'XM' : ISO2[c.iso3]);
export const bondId = (c: Country) => (c.bond ? `IRLTLT01${c.bond}M156N` : undefined);
export const COUNTRIES: Country[] = [
  { iso3: 'USA', name: 'United States', lat: 38.9, lng: -77.04, index: ['^GSPC', 'S&P 500'], fx: ['DX-Y.NYB', 'Dollar Index'], bond: 'US' },
  { iso3: 'CAN', name: 'Canada', lat: 45.42, lng: -75.7, index: ['^GSPTSE', 'S&P/TSX'], fx: ['CAD=X', 'USD/CAD'], bond: 'CA' },
  { iso3: 'MEX', name: 'Mexico', lat: 19.43, lng: -99.13, index: ['^MXX', 'IPC'], fx: ['MXN=X', 'USD/MXN'], bond: 'MX' },
  { iso3: 'BRA', name: 'Brazil', lat: -15.79, lng: -47.88, index: ['^BVSP', 'Bovespa'], fx: ['BRL=X', 'USD/BRL'] },
  { iso3: 'ARG', name: 'Argentina', lat: -34.6, lng: -58.38, index: ['ARGT', 'Global X MSCI Argentina ETF'], fx: ['ARS=X', 'USD/ARS'] },
  { iso3: 'CHL', name: 'Chile', lat: -33.45, lng: -70.67, fx: ['CLP=X', 'USD/CLP'], bond: 'CL' },
  { iso3: 'GBR', name: 'United Kingdom', lat: 51.51, lng: -0.13, index: ['^FTSE', 'FTSE 100'], fx: ['GBPUSD=X', 'GBP/USD'], bond: 'GB' },
  { iso3: 'DEU', name: 'Germany', lat: 52.52, lng: 13.4, index: ['^GDAXI', 'DAX'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'DE' },
  { iso3: 'FRA', name: 'France', lat: 48.86, lng: 2.35, index: ['^FCHI', 'CAC 40'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'FR' },
  { iso3: 'ITA', name: 'Italy', lat: 41.9, lng: 12.5, index: ['FTSEMIB.MI', 'FTSE MIB'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'IT' },
  { iso3: 'ESP', name: 'Spain', lat: 40.42, lng: -3.7, index: ['^IBEX', 'IBEX 35'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'ES' },
  { iso3: 'NLD', name: 'Netherlands', lat: 52.37, lng: 4.9, index: ['^AEX', 'AEX'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'NL' },
  { iso3: 'CHE', name: 'Switzerland', lat: 46.95, lng: 7.45, index: ['^SSMI', 'SMI'], fx: ['CHF=X', 'USD/CHF'], bond: 'CH' },
  { iso3: 'SWE', name: 'Sweden', lat: 59.33, lng: 18.07, index: ['^OMX', 'OMX 30'], fx: ['SEK=X', 'USD/SEK'], bond: 'SE' },
  { iso3: 'POL', name: 'Poland', lat: 52.23, lng: 21.01, index: ['WIG20.WA', 'WIG20'], fx: ['PLN=X', 'USD/PLN'], bond: 'PL' },
  { iso3: 'TUR', name: 'Türkiye', lat: 39.93, lng: 32.86, index: ['XU100.IS', 'BIST 100'], fx: ['TRY=X', 'USD/TRY'] },
  { iso3: 'ISR', name: 'Israel', lat: 31.77, lng: 35.21, index: ['^TA125.TA', 'TA-125'], fx: ['ILS=X', 'USD/ILS'], bond: 'IL' },
  { iso3: 'SAU', name: 'Saudi Arabia', lat: 24.71, lng: 46.68, index: ['^TASI.SR', 'TASI'], fx: ['SAR=X', 'USD/SAR'] },
  { iso3: 'ARE', name: 'UAE', lat: 24.45, lng: 54.38, index: ['FADGI.FGI', 'ADX General'], fx: ['AED=X', 'USD/AED'] },
  { iso3: 'EGY', name: 'Egypt', lat: 30.04, lng: 31.24, index: ['^CASE30', 'EGX 30'], fx: ['EGP=X', 'USD/EGP'] },
  { iso3: 'NGA', name: 'Nigeria', lat: 9.08, lng: 7.4, fx: ['NGN=X', 'USD/NGN'] },
  { iso3: 'ZAF', name: 'South Africa', lat: -25.75, lng: 28.19, index: ['^J203.JO', 'JSE All Share'], fx: ['ZAR=X', 'USD/ZAR'], bond: 'ZA' },
  { iso3: 'RUS', name: 'Russia', lat: 55.76, lng: 37.62, fx: ['RUB=X', 'USD/RUB'] },
  { iso3: 'IND', name: 'India', lat: 28.61, lng: 77.21, index: ['^BSESN', 'Sensex'], fx: ['INR=X', 'USD/INR'] },
  { iso3: 'CHN', name: 'China', lat: 39.9, lng: 116.4, index: ['000001.SS', 'Shanghai Comp.'], fx: ['CNY=X', 'USD/CNY'] },
  { iso3: 'HKG', name: 'Hong Kong', lat: 22.32, lng: 114.17, index: ['^HSI', 'Hang Seng'], fx: ['HKD=X', 'USD/HKD'] },
  { iso3: 'JPN', name: 'Japan', lat: 35.68, lng: 139.69, index: ['^N225', 'Nikkei 225'], fx: ['JPY=X', 'USD/JPY'], bond: 'JP' },
  { iso3: 'KOR', name: 'South Korea', lat: 37.57, lng: 126.98, index: ['^KS11', 'KOSPI'], fx: ['KRW=X', 'USD/KRW'], bond: 'KR' },
  { iso3: 'TWN', name: 'Taiwan', lat: 25.03, lng: 121.57, index: ['^TWII', 'TAIEX'], fx: ['TWD=X', 'USD/TWD'] },
  { iso3: 'SGP', name: 'Singapore', lat: 1.35, lng: 103.82, index: ['^STI', 'STI'], fx: ['SGD=X', 'USD/SGD'] },
  { iso3: 'IDN', name: 'Indonesia', lat: -6.21, lng: 106.85, index: ['^JKSE', 'Jakarta Comp.'], fx: ['IDR=X', 'USD/IDR'] },
  { iso3: 'AUS', name: 'Australia', lat: -35.28, lng: 149.13, index: ['^AXJO', 'ASX 200'], fx: ['AUDUSD=X', 'AUD/USD'], bond: 'AU' },
  { iso3: 'COL', name: 'Colombia', lat: 4.71, lng: -74.07, index: ['ICOLCAP.CL', 'iShares COLCAP ETF'], fx: ['COP=X', 'USD/COP'] },
  { iso3: 'PER', name: 'Peru', lat: -12.05, lng: -77.04, fx: ['PEN=X', 'USD/PEN'] },
  { iso3: 'AUT', name: 'Austria', lat: 48.21, lng: 16.37, index: ['^ATX', 'ATX'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'AT' },
  { iso3: 'BEL', name: 'Belgium', lat: 50.85, lng: 4.35, index: ['^BFX', 'BEL 20'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'BE' },
  { iso3: 'DNK', name: 'Denmark', lat: 55.68, lng: 12.57, index: ['^OMXC25', 'OMX Copenhagen 25'], fx: ['DKK=X', 'USD/DKK'], bond: 'DK' },
  { iso3: 'NOR', name: 'Norway', lat: 59.91, lng: 10.75, index: ['OBX.OL', 'OBX'], fx: ['NOK=X', 'USD/NOK'], bond: 'NO' },
  { iso3: 'FIN', name: 'Finland', lat: 60.17, lng: 24.94, index: ['^OMXH25', 'OMX Helsinki 25'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'FI' },
  { iso3: 'IRL', name: 'Ireland', lat: 53.35, lng: -6.26, index: ['^ISEQ', 'ISEQ All Share'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'IE' },
  { iso3: 'PRT', name: 'Portugal', lat: 38.72, lng: -9.14, index: ['PSI20.LS', 'PSI'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'PT' },
  { iso3: 'GRC', name: 'Greece', lat: 37.98, lng: 23.73, index: ['GD.AT', 'Athens Composite'], fx: ['EURUSD=X', 'EUR/USD'], bond: 'GR' },
  { iso3: 'CZE', name: 'Czechia', lat: 50.08, lng: 14.44, fx: ['CZK=X', 'USD/CZK'], bond: 'CZ' },
  { iso3: 'HUN', name: 'Hungary', lat: 47.5, lng: 19.04, index: ['^BUX.BD', 'BUX'], fx: ['HUF=X', 'USD/HUF'], bond: 'HU' },
  { iso3: 'QAT', name: 'Qatar', lat: 25.29, lng: 51.53, fx: ['QAR=X', 'USD/QAR'] },
  { iso3: 'KWT', name: 'Kuwait', lat: 29.38, lng: 47.99, fx: ['KWD=X', 'USD/KWD'] },
  { iso3: 'MAR', name: 'Morocco', lat: 34.02, lng: -6.84, fx: ['MAD=X', 'USD/MAD'] },
  { iso3: 'GHA', name: 'Ghana', lat: 5.6, lng: -0.19, fx: ['GHS=X', 'USD/GHS'] },
  { iso3: 'KEN', name: 'Kenya', lat: -1.29, lng: 36.82, fx: ['KES=X', 'USD/KES'] },
  { iso3: 'PAK', name: 'Pakistan', lat: 33.68, lng: 73.05, fx: ['PKR=X', 'USD/PKR'] },
  { iso3: 'BGD', name: 'Bangladesh', lat: 23.81, lng: 90.41, fx: ['BDT=X', 'USD/BDT'] },
  { iso3: 'THA', name: 'Thailand', lat: 13.76, lng: 100.5, index: ['^SET.BK', 'SET'], fx: ['THB=X', 'USD/THB'] },
  { iso3: 'MYS', name: 'Malaysia', lat: 3.14, lng: 101.69, index: ['^KLSE', 'FTSE Bursa Malaysia KLCI'], fx: ['MYR=X', 'USD/MYR'] },
  { iso3: 'VNM', name: 'Vietnam', lat: 21.03, lng: 105.85, index: ['^VNINDEX.VN', 'VN-Index'], fx: ['VND=X', 'USD/VND'] },
  { iso3: 'PHL', name: 'Philippines', lat: 14.6, lng: 120.98, index: ['PSEI.PS', 'PSEi'], fx: ['PHP=X', 'USD/PHP'] },
  { iso3: 'NZL', name: 'New Zealand', lat: -41.29, lng: 174.78, index: ['^NZ50', 'NZX 50'], fx: ['NZDUSD=X', 'NZD/USD'], bond: 'NZ' },
];

