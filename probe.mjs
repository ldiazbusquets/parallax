const base = 'https://api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO/';
const ind = 'NGDP_RPCH+PCPIPCH+LUR+GGXCNL_NGDP+GGXWDG_NGDP+BCA_NGDPD+NGDPD+NGDPDPC';
const r = await fetch(`${base}.${ind}.A?startPeriod=2024&endPeriod=2028&detail=dataonly`, { headers: { Accept: 'application/vnd.sdmx.data+csv;version=1.0.0' } }); const t = await r.text();
const rows = t.split('\n').slice(1).map((l) => l.split(',')).filter((x) => x.length > 5);
const cs = [...new Set(rows.map((x) => x[1]))]; console.log('countries', cs.length, 'non-alpha3:', cs.filter((c) => !/^[A-Z]{3}$/.test(c)).join(' '));
console.log('3-letter but odd:', cs.filter((c) => /^[A-Z]{3}$/.test(c) && /^(G|W|X|E|A|O)\d|^G[0-9]/.test(c)).join(' '));
for (const c of ['USA', 'LKA', 'TWN', 'XKX', 'KOS', 'UVK']) console.log(c, JSON.stringify(rows.filter((x) => x[1] === c && x[4] === '2025').map((x) => x[2] + '=' + x[5])));
const s = await (await fetch('https://api.imf.org/external/sdmx/2.1/dataflow/IMF.RES/WEO', { headers: { Accept: 'application/json' } })).json();
const f = s.data.dataflows[0]; console.log('name', JSON.stringify(f.name), JSON.stringify(f.names), JSON.stringify(f.description)?.slice(0, 300), JSON.stringify(f.annotations.map((a) => a.title + ':' + (a.text || '')).slice(0, 12)).slice(0, 1500));
const cl = await fetch('https://api.imf.org/external/sdmx/2.1/codelist/IMF/CL_WEO_COUNTRY', { headers: { Accept: 'application/json' } }); const cj = await cl.text(); console.log('codelist', cl.status, cj.length);
try { const cc = JSON.parse(cj).data.codelists[0].codes; console.log(cc.filter((c) => !/^[A-Z]{3}$/.test(c.id) || /world|advanced|emerging|euro/i.test(c.name)).map((c) => c.id + '=' + c.name).slice(0, 40).join(' | ')); } catch (e) { console.log(cj.slice(0, 300)); }
