const H = { 'User-Agent': 'parallax-probe (github.com/ldiazbusquets/parallax)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const u of ['https://api.adsb.lol/v2/type/B77L', 'https://opendata.adsb.fi/api/v2/type/B77L', 'https://api.adsb.lol/v2/type/MD11', 'https://api.adsb.lol/v2/type/B748', 'https://api.adsb.lol/v2/type/B744']) {
  try { const r = await fetch(u, { headers: H }); const j = await r.json(); const ac = j.ac ?? j.aircraft ?? [];
    console.log('\n##', u, r.status, ac.length, 'keys:', Object.keys(ac[0] ?? {}).join(','));
    const by = {}; for (const a of ac) { const p = (a.flight ?? '').trim().slice(0, 3) || '(none)'; by[p] = (by[p] ?? 0) + 1; }
    console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' '));
    console.log(ac.slice(0, 4).map((a) => JSON.stringify({ f: a.flight, r: a.r, t: a.t, desc: a.desc, ownOp: a.ownOp, year: a.year, dbFlags: a.dbFlags })).join('\n'));
  } catch (e) { console.log(u, String(e)); }
  await sleep(3000);
}
