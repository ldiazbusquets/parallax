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
  imf.org returns 403 to GitHub Actions, but the IMF data portal's SDMX API does not: the job uses
  `api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO/.<IND+IND>.A?startPeriod=…&detail=dataonly` with the sdmx csv Accept header
  (`parseWeoCsv`: ~200 economies, full precision → rounded like DataMapper, NGDPD in dollars → billions; aggregates G001 World,
  G110 Advanced, G200 EMDE, G163 Euro area; Kosovo = KOS). `scripts/imf-weo-saved.json` (60 economies) is the last fallback.
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
  snapshot `screener.json`). Its prices can lag a session or two (Nov 11 still had Nov 9 closes): `nasdaqScreenerFresh` overwrites
  price/change of the top 600 + TRACKED with Yahoo spark quotes (`freshenRows`, row `t`). Analyst ratings: Finnhub `/stock/recommendation` (free). Short interest: FINRA
  `POST api.finra.org/data/group/otcMarket/name/consolidatedShortInterest` (no CORS, snapshot `shorts.json`); daily short-sale
  volume `cdn.finra.org/equity/regsho/daily/CNMSshvolYYYYMMDD.txt` allows browsers. `src/data/equity.ts`.
- Candles: `parseChart` keeps OHLCV when every bar is complete; the site publishes 1y daily bars per tracked symbol in
  `snap/ohlc/<SYM>.json` (rebuilt daily). Line/Candles choice is saved per browser (`fintel.chartstyle`).
- Events (`src/data/events.ts`): only market-moving CAMEO codes: conflict = roots 19/20, 181/183/186, root 15, 138/139;
  unrest = 143/144/145; sanctions = 163*. Conflict/sanctions also need `stateLevel` (armed actor type, or two countries
  with a state actor or country-coded actors; never CRM). Kept if `important` (≥2 sources or ≥3 mentions; files record
  first sight, so counts are low). The job keeps 7 days; `summariseWindow` publishes 24 h at the top level plus `week`
  and `trend` (24 h vs daily average → `vsNormal`). Stories are grouped (`n` reports). The 24h/7d choice is shared
  (`src/ui/evwindow.ts`). `summariseEvents` re-categorises the cached window, so rule changes apply at once.
- Hazards (`src/data/hazards.ts`, CORS, live): USGS `summary/4.5_week` + `significant_month` (keep significant, M6+, tsunami=1);
  GDACS `gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;VO;DR;WF&alertlevel=Orange;Red` (EQ comes from USGS);
  NASA EONET wildfires (IRWIN acres, ≥1,000, prescribed burns excluded).
- Shipping (`src/data/shipping.ts`, CORS, live): IMF PortWatch ArcGIS `PortWatch_chokepoints_database` (28 chokepoints,
  lat/lon) and `Daily_Chokepoints_Data` (n_total, n_tanker…; 1,000 rows per page, page with resultOffset). Lanes:
  `public/data/shipping-lanes.json`, simplified from newzealandpaul/Shipping-Lanes (CC BY 4.0, keep the credit).
- Map countries: every Natural Earth shape is clickable (`src/data/world.ts`: numeric → ISO3/ISO2/name/currency, generated
  from i18n-iso-countries + countries-list, MIT). Countries outside `COUNTRIES` get IMF, World Bank (`country/all`), BIS (by ISO2),
  USD/XXX (`WORLD_FX`, also in quotes-1d) and events (`fipsByName` when FIPS lacks them); no index or bond.
- Installable: `public/manifest.webmanifest` + icons; `src/ui/install.ts` shows "Install app" on beforeinstallprompt.
- Heatmap: squarified treemap (`src/ui/treemap.ts`, tested) of the largest US listings from the screener snapshot, sized by
  market value, one box per company, grouped by Nasdaq sector; Top 100/200/500.
- Layout (`src/ui/layout.tsx`): panel registry lives in App.tsx (`PANELS`); `WORKSPACES` (tabs: Overview, Markets,
  Macro & Rates, Geo, Companies) each have a default layout, rows summing to 12; edits are saved per tab (`#/w/<id>`).

- Top 500 (Phase 4): `topCompanies(screener, WIDE_N)` in equity.ts (share classes merged, preferreds/notes out) picks the
  largest US companies; the job builds their SEC company files weekly (`companies-wide`, a time-boxed slice per run, 8 Form 4s),
  1y OHLC, ratings (~weekly, `.cache/ratings-at.json`) and FINRA short interest. `companies.json` lists every built page;
  the company page is "partial" only when a ticker has no file. Nasdaq writes share classes BRK/B, Yahoo/SEC BRK-B (`dashSym`).
- 13D/13G (`parseStake`, company.ts): XML filings since Dec 2024 (`SCHEDULE 13D|13G[/A]`, primaryDocument minus `xsl…/`).
  13G uses an `sch:` prefix (`classPercent`, `reportingPersonBeneficiallyOwnedAggregateNumberOfShares`), 13D a default
  namespace. A company's submissions also list statements it filed about others: keep only issuer CIK = the company.
- 13F (`src/data/funds.ts`): ~20 named funds, latest 13F-HR info table (the .xml that isn't primary_doc.xml; values in dollars).
  CUSIP → ticker via OpenFIGI `POST api.openfigi.com/v3/mapping` (no key: 10 per request, 25 requests/min; BRK/B style),
  map cached in `.cache/cusips.json`. Wrong CIKs are caught by the `match` regex on the filer name. Link view mode
  "Funds & activists" uses `network.holders` (fund positions ≥2% of the fund, 13D filers).
- Earnings season (`seasonStats`, sources.ts): Finnhub earnings calendar in 2-week calls over 91 days → `season.json`.
- Ports (Phase 5, `src/data/trade.ts`, snapshot `ports.json` daily; live locally): PortWatch `PortWatch_ports_database` (top 30 by vessel_count_total) and
  `Daily_Ports_Data` (portcalls, import, export in tonnes; `date` is DateOnly, `portid IN (...)` works). Daily_Ports_Data takes 20–30 s per 1,000-row page, too slow for
  browsers; don't pass orderByFields on the daily tables (sort client-side) and query only the windows needed.
- Cargo flights: adsb.lol `/v2/point/<lat>/<lon>/150` per hub (no CORS: relay `/px/adsb`, snapshot `cargo.json`). It returns
  429 after ~10 quick calls: 3 s apart in the job. airplanes.live refuses without contact; OpenSky's CORS is its own origin.
  Only all-cargo airline designators (`CARGO_AIRLINES`) are counted. Coverage over mainland China is ~nil.
- Chokepoint risk (`chokeRisk`): violent GDELT week points (CAMEO 18–20, not country centroids) within 250 km, flagged at 3+, plus orange/red hazards.
- Freshness: GitHub fires the deploy's */15 cron only every few hours here, so `.github/workflows/keeper.yml` runs ~5.7 h
  at a time and dispatches "Deploy site" every 15 min with GITHUB_TOKEN (allowed for workflow_dispatch), skipping while
  one is running/queued. If it ever misbehaves, disable that workflow; nothing else depends on it.
- App icon files are versioned (`icon-512-v2.png` …): Chrome and Windows cache icons by URL, so rename on any logo change.

## Look (v6, from Luis's Vexto reference)
- Charcoal `#0c0c0c` page, 22px rounded gradient cards with no header rules, sentence-case titles with a faint ↗.
- Outfit for UI text, Inter Tight (light, tabular) for numbers; `<Big>` dims the decimals of display numbers.
- Pills for tabs/buttons; dashed grids; LineChart marks the window high (white) and low (warm dot).
- One silver-blue accent `#7ca9d4` (hi `#a9c8e6`), the same as Luis's terminal/Lab, used sparingly (lows, focus, active
  command). It replaced the orange `#ef6f3c` in Nov 2026. Luis dislikes yellow/amber: don't drift toward it.
- Card notes fold under an "About this data" disclosure; keep source/method text there, not on the card face.
- Map: Esri World Imagery (desaturated) only (Luis removed the Streets view); overlays are glass (`--glass`).
  Add map layers once the style has parsed (`styleReady`), not `isStyleLoaded()`, which waits for every tile.

## Ideas not built yet (roadmap)
- Shipping, next step: live vessel positions via a free AIS feed (aisstream.io websocket, free key; would need a small relay).
- Admin/health page across Luis's sites (uptime, deploy status, key expiry such as the Canvas token): pinned for later.
