const r = await fetch(`https://api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO/G001+G110+G119+G163+G200.NGDP_RPCH+PCPIPCH.A?startPeriod=2024&endPeriod=2028&detail=dataonly`, { headers: { Accept: 'application/vnd.sdmx.data+csv;version=1.0.0' } });
const rows = (await r.text()).split('\n').slice(1).map((l) => l.split(',')).filter((x) => x.length > 5);
for (const x of rows) if (x[4] === '2025' || x[4] === '2027') console.log(x[1], x[2], x[4], x[5]);
