const B = 'https://ldiazbusquets.github.io/parallax/snap/';
const j = async (f) => (await fetch(B + f + '?t=' + Date.now())).json();
const sc = await j('screener.json'); const n = sc.data.find((r) => r.s === 'NVDA'); console.log('screener generated', new Date(sc.generated).toISOString(), JSON.stringify(n));
const o = await j('ohlc/NVDA.json'); const b = o.data.slice(-4); console.log('ohlc generated', new Date(o.generated).toISOString(), JSON.stringify(b.map((x) => [new Date(x.t * (x.t < 1e12 ? 1000 : 1)).toISOString().slice(0, 10), x.c])));
const y = await (await fetch('https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=5d&interval=1d&includePrePost=false', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
const r = y.chart.result[0]; console.log('yahoo', JSON.stringify(r.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), r.indicators.quote[0].close[i]])), 'post', r.meta.postMarketPrice, 'reg', r.meta.regularMarketPrice, r.meta.chartPreviousClose);
const q = await (await fetch('https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=2d&interval=15m&includePrePost=true', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
const rr = q.chart.result[0]; const pts = rr.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(5, 16), rr.indicators.quote[0].close[i]]).filter((x) => x[1] != null);
console.log('intraday incl ext', JSON.stringify(pts.filter((_, i) => i % 6 === 0)));
