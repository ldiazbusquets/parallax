# Parallax (formerly FINTEL COMMAND): project context for Claude

The repo is ldiazbusquets/parallax (site: ldiazbusquets.github.io/parallax/); the product name is Parallax. It's a three-person project: Luis Diaz Busquets,
Martin Fantauzzi Figueroa and Martha Ortiz Serrano (credited in the footer, README and LICENSE). Internal ids (`fintel.*` storage
keys, `fintel:*` events, the `fintel-project/` folder) keep the old name on purpose: renaming storage keys
would wipe visitors' saved layouts, watchlists, alerts and keys.

The app lives in `fintel-project/`. See its README for running it and the source table.

## Rules
- **No invented data.** Every number must come from a real source. If a source fails, the panel shows its
  error/stale state. Don't add static "fallback" numbers, seeded random sparklines or sample tables.
  (v4 had these; v5 removed them.)
- Keys never go in the repo. Optional keys: Settings (localStorage) or `.env` (git-ignored). `SEC_USER_AGENT`
  is server-side only (vite.config.ts).
- Keep `npm run build` (strict TS, noUnusedLocals) and `npm test` green. The GitHub "CI" workflow runs both.

## Modes (src/lib/env.ts)
- Local dev/preview: CORS-blocked hosts via the Vite relay `/px/<name>`.
- Website (`VITE_STATIC=1`): those hosts come from `public/snap/*.json` (`{ generated, data }`) written by
  `scripts/snapshot.ts`, run by `.github/workflows/deploy.yml` every ~15 min. Source defs set `asOf` so
  "updated" shows the snapshot time. Anything a browser can call directly stays live.
- Node (snapshot script, run with vite-node): hosts fetched directly; `getText` adds a User-Agent
  (`SEC_USER_AGENT` secret for sec.gov).
- Relay prefixes are prefix-matched in order: never add one that starts with an existing one (`/px/sec*`).

## Architecture
- `src/data/store.ts`: every data source is a `SourceDef { id, label, provider, every, requires?, fetch }`.
  `useSource(def)` shares one fetch per id across panels, refreshes on `every`, pauses while the tab is
  hidden, keeps the last data as `stale` on failure, and re-runs if a refresh was requested mid-flight.
  Parameterised defs go through `sourceFor(id, make)` so the id maps to one object.
- Quotes: `useQuotes(symbols)` registers symbols with one shared Yahoo spark source (`yahoo:quotes`,
  20 symbols per request). Don't create per-panel quote fetches.
- Panels use `<Panel title src span note right>`; it renders loading/error/needs-key states and the
  provider + "updated" footer. Grid spans: c3/c4/c6/c8/c12 on a 12-column grid; each row should sum to 12.
- CORS-blocked hosts go through the Vite relay `/px/<name>` (yahoo, fred, sec, fed, cnbc, mw, groq).
  Direct from the browser: fiscaldata.treasury.gov, publicreporting.cftc.gov, CoinGecko, alternative.me,
  mempool.space, World Bank, Finnhub, Esri imagery tiles.

## Verified endpoints (Nov 2026)
- Yahoo: `/v7/finance/spark?symbols=A,B&range=1d&interval=5m` (no key). Result order ≠ request order.
- FRED: `/graph/fredgraph.csv?id=X&cosd=YYYY-MM-DD`; blank value = no observation (skip it).
  Dead/stale IDs: IRSTCB01* (stopped 2023). Live: DFEDTARU/L, EFFR, SOFR, ECBDFR, IUDSOIA, DGS*, T10Y2Y,
  T10Y3M, T10YIE, DFII10, BAMLH0A0HYM2, BAMLC0A0CM, NFCI, STLFSI4, WALCL, WTREGEN, RRPONTSYD, DTWEXBGS, plus
  macro CPIAUCSL, CPILFESL, PCEPILFE, UNRATE, PAYEMS, ICSA, A191RL1Q225SBEA, RSAFS, INDPRO, HOUST, UMCSENT, M2SL.
- Treasury auctions: results lag ~3 weeks in `auctions_query`; filter `bid_to_cover_ratio:gt:0` for results.
- CFTC: TFF dataset `gpe5-46if` (lev_money_*), disaggregated `72hh-3qpy` (m_money_*_all).
  Consolidated codes: S&P 500 `13874+`, Nasdaq-100 `20974+`.

- BIS policy rates: `stats.bis.org/api/v1/data/WS_CBPOL/D./all?startPeriod=…&detail=dataonly` with
  `Accept: application/vnd.sdmx.data+csv;version=1.0.0`. No CORS (relay `/px/bis`, snapshot `bis.json`). Euro area = XM.
- IMF WEO: `imf.org/external/datamapper/api/v1/<INDICATOR>` (all countries, all years; `periods` is ignored).
  No CORS (relay `/px/imf`, snapshot `imf.json`). Aggregates: WEOWORLD, ADVEC, OEMDC, EURO. Includes Taiwan.
  imf.org returns 403 to GitHub Actions, so the job publishes `scripts/imf-weo-saved.json` (captured from the same
  API in a browser, SHA-256 verified, 2026-11-07). Refresh it each April/October when a new WEO edition appears.
  DBnomics' IMF mirror stops at WEO 2024-10: don't use it.
- GDELT: the GEO 2.0 API is gone (404) and the DOC API allows 1 request / 5 s, so events come from the raw 2.0
  event files: `http://data.gdeltproject.org/gdeltv2/<YYYYMMDDHHMM00>.export.CSV.zip` every 15 min (the newest can
  404 for a few minutes on https). 61 tab-separated columns: EventCode 26, EventRootCode 28, NumMentions 31, ActionGeo
  FullName 52 / CountryCode (FIPS) 53 / Lat 56 / Long 57, DATEADDED 59, SOURCEURL 60. The job keeps a rolling 24 h
  window in `.cache/events-raw.json` (Actions cache) and publishes `events.json` (`src/data/events.ts`, unit-tested).
  Never open GDELT JSON/zip URLs directly in Luis's Chrome (they download); fetch from inside a GDELT HTML page.
- OECD 10Y government yields on FRED: `IRLTLT01<CC>M156N` (monthly). Live for 29 OECD countries; none for
  BR, CN, IN, ID, TR, CO (404) and RU (stopped 2018).
- Yahoo indices that don't exist: ^IPSA (Chile), ^COLCAP (use ICOLCAP.CL ETF), ^SPBLPGPT (Peru), ^PX (Prague = 0),
  ^KSE100, ^MASI, ^NGSE, ^QSI, ^DFMGI. Countries without one show currency only. ^MERV stopped updating
  2026-10-16 (Argentina uses the ARGT ETF). Quotes older than 5 days show 'as of <date>' (`isStaleQuote`).
- Company data (`src/data/company.ts`): CIK from company_tickers.json; submissions + XBRL companyfacts from
  data.sec.gov (companyfacts has no CORS, so the site precomputes); Form 4 raw XML = primaryDocument with the
  `xslF345X05/` prefix removed. TTM = last FY + current YTD − prior-year YTD. Unit-tested.
- Economic calendar: `nfs.faireconomy.media/ff_calendar_thisweek.json` (title, country = currency, ISO date, impact,
  forecast, previous; no actuals). No CORS (relay `/px/ff`, snapshot `ecocal.json`, polled hourly). `src/data/global.ts`.
- Daily 10y yields (`src/data/global.ts`, unit-tested): Bundesbank BBSIS `…R10XX…` CSV, ECB `YC/B.U2.EUR.4F.G_N_C.SV_C_YM.SR_10Y`,
  BoC Valet `BD.CDN.10YR.DQ.YLD` (these three allow browsers), BoE IADB `IUDMNZC` (10y zero-coupon), MOF `jgbcme(_all).csv`,
  RBA `f2-data.csv` `FCMYGBAG10D` (no CORS: relays `/px/boe|mof|rba`, snapshot `yields.json`).
- Global credit: ICE BofA OAS on FRED (`GLOBAL_CREDIT` in fred.ts), all live as of Nov 2026. History is limited to ~3 years.
- Screener: `api.nasdaq.com/api/screener/stocks?tableonly=true&download=true` (~7k rows, 2 MB; no CORS → relay `/px/nasdaq`,
  snapshot `screener.json`). Analyst ratings: Finnhub `/stock/recommendation` (free). Short interest: FINRA
  `POST api.finra.org/data/group/otcMarket/name/consolidatedShortInterest` (no CORS, snapshot `shorts.json`); daily short-sale
  volume `cdn.finra.org/equity/regsho/daily/CNMSshvolYYYYMMDD.txt` allows browsers. `src/data/equity.ts`.
- Candles: `parseChart` keeps OHLCV when every bar is complete; the site publishes 1y daily bars per tracked symbol in
  `snap/ohlc/<SYM>.json` (rebuilt daily). Line/Candles choice is saved per browser (`fintel.chartstyle`).
- Events (`src/data/events.ts`): only market-moving CAMEO codes: conflict = roots 19/20, 181/183/186, root 15, 138/139;
  unrest = 143/144/145; sanctions = 163*. Kept only if `important` (≥2 sources or ≥10 mentions). Ordinary protests,
  assaults and arrests are dropped. `summariseEvents` re-categorises the cached window, so rule changes apply at once.
- Hazards (`src/data/hazards.ts`, CORS, live): USGS `summary/4.5_week` + `significant_month` (keep significant, M6+, tsunami=1);
  GDACS `gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;VO;DR;WF&alertlevel=Orange;Red` (EQ comes from USGS);
  NASA EONET wildfires (IRWIN acres, ≥1,000, prescribed burns excluded).
- Shipping (`src/data/shipping.ts`, CORS, live): IMF PortWatch ArcGIS `PortWatch_chokepoints_database` (28 chokepoints,
  lat/lon) and `Daily_Chokepoints_Data` (n_total, n_tanker…; 1,000 rows per page, page with resultOffset). Lanes:
  `public/data/shipping-lanes.json`, simplified from newzealandpaul/Shipping-Lanes (CC BY 4.0, keep the credit).
- Installable: `public/manifest.webmanifest` + icons; `src/ui/install.ts` shows "Install app" on beforeinstallprompt.
- Layout (`src/ui/layout.tsx`): panel registry lives in App.tsx (`PANELS`); `WORKSPACES` (tabs: Overview, Markets,
  Macro & Rates, Geo, Companies) each have a default layout, rows summing to 12; edits are saved per tab (`#/w/<id>`).

## Look (v6, from Luis's Vexto reference)
- Charcoal `#0c0c0c` page, 22px rounded gradient cards with no header rules, sentence-case titles with a faint ↗.
- Outfit for UI text, Inter Tight (light, tabular) for numbers; `<Big>` dims the decimals of display numbers.
- Pills for tabs/buttons; dashed grids; LineChart marks the window high (white) and low (warm dot).
- One warm accent `#ef6f3c`, used sparingly (lows, focus, active command). Luis dislikes yellow/amber: don't drift toward it.
- Map: Esri World Imagery (desaturated) only (Luis removed the Streets view); overlays are glass (`--glass`).
  Add map layers once the style has parsed (`styleReady`), not `isStyleLoaded()`, which waits for every tile.

## Ideas not built yet (roadmap)
- Shipping, next step: port-level calls (PortWatch `Daily_Ports_Data`) and live vessel positions via a free AIS feed
  (aisstream.io websocket, free key; would need a small relay).
- Cargo flights: OpenSky Network / adsb.lol ADS-B positions filtered to cargo operators (FedEx FDX, UPS, Atlas GTI,
  Cargolux CLX, Kalitta, Cathay/Emirates/Qatar cargo callsigns) as a map layer with hub traffic counts.
- Admin/health page across Luis's sites (uptime, deploy status, key expiry such as the Canvas token): pinned for later.
- Earnings-season beat rate across a full season (needs a longer Finnhub window).
- Institutional holders (13F) and activist stakes (13D/G) as extra edges in the link view.
