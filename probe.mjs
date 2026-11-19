const H = { 'User-Agent': 'Mozilla/5.0' };
const y = await fetch('https://query1.finance.yahoo.com/v7/finance/spark?symbols=CLZ26.NYM,CLF27.NYM,CLZ27.NYM,GCZ26.CMX,GCG27.CMX,NGF27.NYM&range=1mo&interval=1d', { headers: H });
const j = await y.json(); for (const r of j.spark?.result ?? []) { const x = r.response?.[0]; const c = x?.indicators?.quote?.[0]?.close ?? []; console.log(r.symbol, x?.meta?.regularMarketPrice, new Date((x?.meta?.regularMarketTime??0)*1000).toISOString(), c.length, c.slice(-3)); }
for (const [route, s] of [['petroleum/stoc/wstk', 'WCESTUS1'], ['natural-gas/stor/wkly', 'NW2_EPG0_SWO_R48_BCF']]) {
  const r = await fetch(`https://api.eia.gov/v2/${route}/data/?api_key=DEMO_KEY&frequency=weekly&data[0]=value&facets[series][]=${s}&start=2020-01-01&sort[0][column]=period&sort[0][direction]=asc&length=5000`, { headers: { Origin: 'https://ldiazbusquets.github.io' } });
  const t = await r.json(); const d = t.response?.data ?? []; console.log(route, r.status, r.headers.get('access-control-allow-origin'), d.length, JSON.stringify(d.at(-1)), t.error ?? '');
}
