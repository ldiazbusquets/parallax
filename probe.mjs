const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Origin: 'https://ldiazbusquets.github.io' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MC = 'FGHJKMNQUVXZ';
function months(n, from = new Date(2026, 11, 1)) { const out = []; for (let i = 0; i < n; i++) { const d = new Date(from.getFullYear(), from.getMonth() + i, 1); out.push(MC[d.getMonth()] + String(d.getFullYear()).slice(2)); } return out; }
async function show(label, url, opt = {}) {
  try { const r = await fetch(url, { headers: UA, ...opt }); const t = await r.text();
    console.log(`\n== ${label} ${r.status} ACAO=${r.headers.get('access-control-allow-origin')} type=${r.headers.get('content-type')} len=${t.length}`); console.log(t.slice(0, opt.n ?? 600).replace(/\s+/g, ' '));
    return t; } catch (e) { console.log(`\n== ${label} ERR ${e}`); }
}
// 1. Yahoo contract months via spark
for (const [root, ex] of [['CL', 'NYM'], ['BZ', 'NYM'], ['NG', 'NYM'], ['GC', 'CMX'], ['SI', 'CMX'], ['HG', 'CMX'], ['RB', 'NYM'], ['HO', 'NYM']]) {
  const syms = months(24).map((m) => `${root}${m}.${ex}`);
  for (let i = 0; i < syms.length; i += 12) {
    const u = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${syms.slice(i, i + 12).join(',')}&range=5d&interval=1d`;
    try { const r = await fetch(u, { headers: UA }); const j = await r.json(); const res = j.spark?.result ?? [];
      console.log(root, i, r.status, res.map((x) => { const m = x.response?.[0]?.meta; const c = x.response?.[0]?.indicators?.quote?.[0]?.close?.filter((v) => v != null); return `${x.symbol}:${m?.regularMarketPrice ?? (c && c[c.length - 1]) ?? 'x'}`; }).join(' '));
    } catch (e) { console.log(root, 'ERR', String(e)); }
    await sleep(400);
  }
}
// 2. EIA without a key
await show('EIA leaf crude', 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCESTUS1&f=W', { n: 300 });
await show('EIA xls crude', 'https://www.eia.gov/dnav/pet/hist_xls/WCESTUS1w.xls', { n: 120 });
await show('EIA api v2 DEMO', 'https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=DEMO_KEY&frequency=weekly&data[0]=value&facets[series][]=WCESTUS1&sort[0][column]=period&sort[0][direction]=desc&length=5', { n: 500 });
await show('EIA ngs json', 'https://ir.eia.gov/ngs/wngsr.json', { n: 600 });
await show('EIA ng storage hist', 'https://www.eia.gov/dnav/ng/hist/nw2_epg0_swo_r48_bcfw.htm', { n: 300 });
await show('EIA wpsr table1 csv', 'https://ir.eia.gov/wpsr/table1.csv', { n: 800 });
await show('EIA wpsr overview', 'https://ir.eia.gov/wpsr/overview.pdf', { n: 50 });
await show('EIA weekly series json (seriesid)', 'https://api.eia.gov/series/?series_id=PET.WCESTUS1.W&api_key=DEMO_KEY', { n: 300 });
// 3. long gold history
await show('Yahoo 5y gold weekly', 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=10y&interval=1wk', { n: 300 });
