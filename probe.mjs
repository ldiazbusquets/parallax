const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { Origin: 'https://ldiazbusquets.github.io' };
for (const u of ['https://api.adsb.lol/v2/mil', 'https://api.adsb.lol/v2/type/B763', 'https://opendata.adsb.fi/api/v2/mil', 'https://api.airplanes.live/v2/mil', 'https://api.adsb.one/v2/mil']) {
  try {
    const r = await fetch(u, { headers: H }); const t = await r.text();
    const acao = r.headers.get('access-control-allow-origin');
    let n = '', sample = '';
    try { const j = JSON.parse(t); const ac = j.ac || j.aircraft || []; n = ac.length;
      sample = JSON.stringify(ac.slice(0, 2).map((a) => ({ hex: a.hex, flight: a.flight, t: a.t, desc: a.desc, r: a.r, ownOp: a.ownOp, dbFlags: a.dbFlags, lat: a.lat, lon: a.lon, alt: a.alt_baro, gs: a.gs, seen: a.seen })));
      const types = {}; ac.forEach((a) => { types[a.t] = (types[a.t] || 0) + 1; }); console.log('TOP TYPES', Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 15).map((x) => x.join(':')).join(' '));
      console.log('withpos', ac.filter((a) => a.lat != null).length, 'airborne', ac.filter((a) => a.alt_baro !== 'ground').length);
    } catch {}
    console.log(u, r.status, 'ACAO=', acao, 'n=', n, t.length); console.log(sample);
    // preflight check
    const o = await fetch(u, { method: 'OPTIONS', headers: { ...H, 'Access-Control-Request-Method': 'GET' } }).catch((e) => ({ status: String(e), headers: new Headers() }));
    console.log('  OPTIONS', o.status, o.headers.get('access-control-allow-origin'), o.headers.get('access-control-allow-methods'));
  } catch (e) { console.log(u, 'ERR', String(e)); }
  await sleep(2500);
}
