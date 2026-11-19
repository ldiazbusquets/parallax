const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function j(u) { const r = await fetch(u, { headers: UA }); return [r.status, await r.json().catch(() => null)]; }
const K = 'DEMO_KEY';
let [s, d] = await j(`https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=${K}&frequency=weekly&data[0]=value&facets[series][]=WCESTUS1&facets[series][]=WGTSTUS1&facets[series][]=WDISTUS1&facets[series][]=W_EPC0_SAX_YCUOK_MBBL&start=2020-01-01&sort[0][column]=period&sort[0][direction]=desc&length=5000`);
console.log('pet', s, d?.response?.total, JSON.stringify(d?.response?.data?.slice(0, 4).map((x) => [x.period, x.series, x.value, x.units, x['series-description']])));
const per = {}; (d?.response?.data ?? []).forEach((x) => { per[x.series] = (per[x.series] || 0) + 1; }); console.log(per);
await sleep(1500);
[s, d] = await j(`https://api.eia.gov/v2/natural-gas/stor/wkly/data/?api_key=${K}&frequency=weekly&data[0]=value&facets[series][]=NW2_EPG0_SWO_R48_BCF&start=2020-01-01&sort[0][column]=period&sort[0][direction]=desc&length=5000`);
console.log('ng', s, d?.response?.total, JSON.stringify(d?.response?.data?.slice(0, 3).map((x) => [x.period, x.series, x.value, x.units, x['series-description']])), d?.error || '');
await sleep(1500);
[s, d] = await j(`https://api.eia.gov/v2/natural-gas/stor/wkly/facet/series?api_key=${K}`);
console.log('ng facets', s, JSON.stringify(d?.response?.facets?.filter((f) => /R48|Lower 48/i.test(f.id + f.name)).slice(0, 6)));
const r = await fetch('https://query1.finance.yahoo.com/v7/finance/spark?symbols=CLZ26.NYM,CLF27.NYM,GCX27.CMX,SIX27.CMX&range=5d&interval=1d', { headers: UA });
const sp = await r.json();
for (const x of sp.spark.result) { const m = x.response[0].meta, q = x.response[0]; console.log(x.symbol, m.regularMarketPrice, new Date(m.regularMarketTime * 1000).toISOString(), (q.timestamp || []).map((t) => new Date(t * 1000).toISOString().slice(0, 10)).join(','), JSON.stringify(q.indicators.quote[0].close)); }
