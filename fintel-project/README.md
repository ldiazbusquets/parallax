# Parallax

An open-source financial-intelligence terminal in the spirit of Bloomberg and Palantir: global markets, rates,
macro, positioning, company fundamentals, insider networks, filings and news on one screen.
React 18 · TypeScript 5 (strict) · Vite 5 · MapLibre GL. Every number on screen comes from a real source;
when a source is down the panel says so instead of showing placeholder data.

## Run it

```bash
cd fintel-project
npm install
cp .env.example .env      # optional: add SEC_USER_AGENT (your name + email) so EDGAR filings load
npm run dev               # http://localhost:5173
```

No API keys are required. Two optional free keys unlock extra panels; paste them in **Settings** (the status
button, top right) or put them in `.env`:

| Key | Unlocks | Get one |
|---|---|---|
| Finnhub | Earnings calendar with EPS beats/misses, IPO calendar | finnhub.io/register |
| Groq | AI morning brief written only from the numbers on screen | console.groq.com/keys |

## Two ways to run it

| | Local (`npm run dev`) | Website (GitHub Pages) |
|---|---|---|
| Market data | live, every 60 s | snapshot refreshed about every 15 min |
| Company pages | any SEC-registered company | the ~60 companies the site tracks |
| Everything else | live | live where the source allows browsers (Treasury, CFTC, crypto, World Bank, Finnhub, Groq), otherwise snapshot |

The website is built by `.github/workflows/deploy.yml`: on every push and about every 15 minutes it runs
`scripts/snapshot.ts` (fetches Yahoo, FRED, SEC and news into `public/snap/`), builds with `VITE_STATIC=1`
and deploys to Pages. Company files (financials + Form 4) are rebuilt once a day and carried between runs in
the Actions cache. One-time setup: repo **Settings → Pages → Source: GitHub Actions**, and a repository
secret **`SEC_USER_AGENT`** (a name and contact email, e.g. `Parallax contact@example.com`) because the
SEC asks automated tools to identify themselves.

## Using it

- **Command line**: press `/` or Ctrl/⌘+K. Type a ticker (`NVDA`) for its company page (DES) or chart (GP),
  or a function: `WEI` indices, `YCRV` curve, `ECO` economy, `BTMM` Fed & liquidity, `POLR` global policy rates, `WEO` IMF outlook by country, `EVNT` world events, `COT` positioning,
  `LINK` insider network, `CF` filings, `EVTS` earnings, `ALRT` alerts, `MAP`, `TOP` news.
- **Company page** (`#/c/TICKER`): price chart, valuation (market cap, P/E, P/S from live price and SEC
  shares/EPS), 5-year and quarterly financials with TTM, profile, insider transactions from Form 4, recent
  filings and connections to other tracked companies.
- **Link analysis**: companies and the officers, directors and 10% owners who connect them (board interlocks),
  from Form 4 filings. Click to focus, double-click to open a company.
- **Alerts**: price above/below or daily move beyond a %, with browser notifications while the tab is open.
- **Layouts**: presets (Full terminal, Equities desk, Macro & rates, Cross-asset) or *Edit layout* to drag,
  resize, hide and restore panels. Saved in your browser.

## Panels and where the data comes from

| Panel | Source | Refresh |
|---|---|---|
| Ticker tape, indices, sectors, volatility, commodities, FX, heatmap, watchlist, S&P history | Yahoo Finance chart API (delayed) | 60 s |
| Global map: 57 countries, index & currency, chokepoints | Yahoo Finance + World Bank indicators | 60 s / daily |
| Treasury curve, Fed & central banks, liquidity, credit & conditions | FRED (St. Louis Fed) | 30 min |
| Global policy rates (~40 central banks), policy rate on the map | Bank for International Settlements | 6 h |
| World events: conflict, protest, coercion & sanctions on the map and in a feed (last 24 h) | GDELT 2.0 event database | 15 min |
| Company news | Finnhub (site: tracked companies; locally: your key) | 2 h / 30 min |
| World economic outlook (growth, inflation, unemployment, fiscal, debt, current account, forecasts) | IMF World Economic Outlook | 12 h |
| 10-year government yields by country (map) | OECD via FRED, monthly | 1 h |
| US economy (CPI, PCE, jobs, GDP, retail, housing, sentiment, M2) | FRED | 1 h |
| Fed funds futures-implied rate | Yahoo (ZQ=F) | 60 s |
| Treasury auctions (results & upcoming) | fiscaldata.treasury.gov | 1 h |
| Speculative positioning (COT) | CFTC public reporting API | 6 h |
| Crypto (prices, dominance, Fear & Greed, BTC fees) | CoinGecko, alternative.me, mempool.space | 2 min |
| SEC filings (8-K, Form 4, S-1, 13D) | SEC EDGAR live feed | 5 min |
| Headlines + headline tone | CNBC, MarketWatch, Federal Reserve, SEC RSS | 5 min |
| Earnings & IPOs | Finnhub (key) | 1 h |
| Morning brief | Groq, gpt-oss-120b (key) | on demand |
| Company pages, insider network | SEC EDGAR submissions, XBRL company facts, Form 4 | daily (site) / on open (local) |
| Alerts | evaluated on each quote refresh | with quotes |
| Economic calendar (this week, forecast & previous) | Forex Factory weekly feed | 1 h |
| Government bonds, 10-year daily (DE, euro area, UK, JP, CA, AU + US) | Bundesbank, ECB, Bank of England, Japan MOF, Bank of Canada, RBA | 1 h |
| Global credit spreads (US by rating, euro HY, EM by region) | ICE BofA indices via FRED | 30 min |
| Candlestick charts (watchlist, company pages) | Yahoo Finance OHLC (site: tracked symbols, 5D–1Y daily) | with charts |
| Stock screener (every US-listed stock) | Nasdaq screener + FINRA daily short volume | 15 min / daily |
| Analyst ratings (company pages, screener) | Finnhub recommendation trends | daily (site) / your key |
| Market-moving events (war & conflict, strikes & unrest, sanctions; widely reported only) | GDELT 2.0 event files | 15 min (site) |
| Natural hazards (significant quakes, tsunami flags, Orange/Red cyclone, flood, volcano, drought alerts, large wildfires) | USGS, GDACS, NASA EONET | 30 min, live |
| Shipping chokepoints (daily transits, YoY) | IMF PortWatch | 6 h, live |
| Port traffic (30 busiest ports: calls, cargo tonnes, YoY) | IMF PortWatch | 6 h, live |
| Cargo flights near 16 air-freight hubs | adsb.lol community ADS-B feed | each site update (snapshot) / 15 min locally |
| Chokepoint risk (conflict, sanctions, hazards within 500 km) | GDELT · USGS · GDACS · NASA EONET | with the events |
| Fund holdings (latest 13F of ~20 well-known funds) | SEC EDGAR · OpenFIGI (CUSIP → ticker) | daily check |
| 5%+ holders (Schedules 13D/13G) on company pages | SEC EDGAR | with the company file |
| Earnings season beat rate (91 days, largest 500 and everyone) | Finnhub | 6 h |
| Capitals of every country and territory (map dots) | Natural Earth (public domain) · GeoNames (CC BY 4.0) | fixed |
| Full company pages for the 500 largest US companies | SEC EDGAR · Yahoo · Finnhub · FINRA | weekly (site) |
| Shipping lanes (map) | Benden, Global Shipping Lanes (CC BY 4.0), from the CIA World Oceans map | static |
| Short interest | FINRA consolidated short interest (twice monthly) + Reg SHO daily short volume | 12 h / daily |

Locally, sources without browser (CORS) access go through the Vite dev/preview server relay (`/px/*` in
`vite.config.ts`). The website reads those from the snapshot instead.

## Scripts

```bash
npm run dev        # dev server with hot reload and the data relay
npm run build      # strict typecheck + production build
npm run preview    # serve the build, with the relay
npm run snapshot   # write the website data snapshot to public/snap (also builds the insider network for local use)
npm run build:site # build the website version (reads public/snap)
npm test           # unit tests for parsers, financial calculations, Form 4 and the data store
npm run typecheck
```

## Layout

```
src/
  main.tsx, App.tsx          shell: header, clocks, ticker, grid, settings
  data/
    store.ts                 shared source store: dedupe, refresh, stale-on-error, status
    yahoo.ts                 quotes (one batched source all panels share) and charts
    fred.ts                  FRED CSV, YoY / diff helpers
    sources.ts               Treasury, CFTC, crypto, World Bank, EDGAR, RSS, Finnhub, Groq
    company.ts               SEC company data: financials + TTM, Form 4 parsing, insider network
    universe.ts              instrument lists, FOMC dates, map countries & chokepoints
    parsers.test.ts          unit tests
  lib/env.ts                 local / website / Node modes, snapshot loader
  panels/                    markets, macro, flows, brief, company (DES/FA), network (LINK), alerts
  map/WorldMap.tsx
  ui/                        kit.tsx (Panel, Spark, Chg, Tabs), charts.tsx, Command.tsx, layout.tsx, theme.ts, styles.css
scripts/snapshot.ts          website data job
```

For research, not trading advice. Yahoo Finance data is delayed and for personal use.

## Install as an app

Parallax ships a web app manifest (`public/manifest.webmanifest`, icons in `public/`). In Chrome or Edge use **Install app** in the top bar or the address-bar install icon; on iPhone/iPad, Share → Add to Home Screen; in Safari on a Mac, File → Add to Dock.
