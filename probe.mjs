const base = 'https://api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO/';
const ind = 'NGDP_RPCH+PCPIPCH+LUR+GGXCNL_NGDP+GGXWDG_NGDP+BCA_NGDPD+NGDPD+NGDPDPC';
for (const [k, acc] of [['csv', 'application/vnd.sdmx.data+csv;version=1.0.0'], ['csv2', 'text/csv']]) {
  const t0 = Date.now(); const r = await fetch(`${base}.${ind}.A?startPeriod=2024&endPeriod=2028&detail=dataonly`, { headers: { Accept: acc } }); const t = await r.text();
  const lines = t.split('\n'); console.log(k, r.status, r.headers.get('content-type'), t.length, lines.length, Date.now() - t0, 'ms');
  console.log(lines.slice(0, 4).join('\n')); console.log(lines.filter((l) => l.includes('LKA')).slice(0, 3).join('\n'));
  const cs = new Set(lines.map((l) => l.split(',')[2])); console.log('distinct col2', cs.size, [...cs].slice(0, 15).join(' '));
}
const s = await fetch('https://api.imf.org/external/sdmx/2.1/dataflow/IMF.RES/WEO', { headers: { Accept: 'application/json' } }); const st = await s.text(); console.log('flow', s.status, st.slice(0, 900).replace(/\s+/g, ' '));
