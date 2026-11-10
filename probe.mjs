const UA = { 'User-Agent': process.env.SEC_USER_AGENT || 'Parallax research parallax@example.com' };
const sec = async (u, text) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(u + ' ' + r.status); return text ? r.text() : r.json(); };
const show = (label, x) => console.log('\n=== ' + label + '\n' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 3000));
const tryit = async (label, fn) => { try { show(label, await fn()); } catch (e) { show(label + ' ERROR', String(e)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await tryit('percent tags', async () => {
  const out = [];
  for (const cik of ['0000320193', '0000317540', '0001045810', '0000789019']) {
    const s = await sec(`https://data.sec.gov/submissions/CIK${cik}.json`); const r = s.filings.recent;
    for (let i = 0, k = 0; i < r.form.length && k < 2; i++) if (/^SCHEDULE 13[DG]/.test(r.form[i])) {
      k++; const x = await sec(`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${r.accessionNumber[i].replace(/-/g, '')}/${r.primaryDocument[i].replace(/^xsl[^/]+\//, '')}`, true);
      out.push(r.form[i] + ' ' + [...new Set(x.match(/<[\w:]*(?:[Pp]ercent|[Aa]ggregate|[Aa]mount)[\w]*>[^<]{0,20}/g) || [])].slice(0, 6).join(' | '));
    }
  }
  return out.join('\n');
});
await tryit('OpenFIGI 10', async () => {
  const r = await fetch('https://api.openfigi.com/v3/mapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(['037833100','02079K305','084670702','11135F101','594918104','00724F101','17275R102','46625H100','30303M102','02005N100'].map((c) => ({ idType: 'ID_CUSIP', idValue: c, exchCode: 'US' }))) });
  const t = await r.text(); return r.status + ' ' + t.slice(0, 200) + '\n' + (() => { try { return JSON.stringify(JSON.parse(t).map((x) => x.data?.map((d) => d.ticker + '/' + d.marketSector).join(',') ?? x.warning)); } catch { return ''; } })();
});
const PW = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services';
const q = async (svc, p) => (await fetch(`${PW}/${svc}/FeatureServer/0/query?` + new URLSearchParams({ f: 'json', returnGeometry: 'false', ...p }))).json();
let ids = [];
await tryit('top ports', async () => { const j = await q('PortWatch_ports_database', { where: '1=1', outFields: 'portid,portname,country,ISO3,lat,lon,vessel_count_total,vessel_count_container,vessel_count_tanker,industry_top1', orderByFields: 'vessel_count_total DESC', resultRecordCount: '40' }); ids = j.features.map((f) => f.attributes.portid); return j.features.map((f) => Object.values(f.attributes).join(' ')).join('\n'); });
await tryit('daily ports one', async () => q('Daily_Ports_Data', { where: `portid='${ids[0]}'`, outFields: '*', orderByFields: 'date DESC', resultRecordCount: '2' }));
await tryit('daily ports count', async () => q('Daily_Ports_Data', { where: `portid IN (${ids.map((i) => `'${i}'`).join(',')}) AND date >= DATE '2025-10-01'`, returnCountOnly: 'true' }));
await tryit('daily ports maxRecord', async () => { const j = await (await fetch(`${PW}/Daily_Ports_Data/FeatureServer/0?f=json`)).json(); return { max: j.maxRecordCount, date: j.fields.find((f) => f.name === 'date') }; });
await tryit('chokepoints fields', async () => { const j = await (await fetch(`${PW}/Daily_Chokepoints_Data/FeatureServer/0?f=json`)).json(); return j.fields.map((f) => f.name).join(', '); });
const hubs = [['ANC', 61.17, -150.0], ['LEJ', 51.42, 12.24], ['HKG', 22.31, 113.92], ['SDF', 38.17, -85.74], ['CVG', 39.05, -84.67], ['DXB', 25.25, 55.36], ['PVG', 31.14, 121.81], ['ICN', 37.46, 126.44], ['LUX', 49.63, 6.21], ['DOH', 25.27, 51.61], ['MIA', 25.79, -80.29], ['ORD', 41.98, -87.90], ['FRA', 50.03, 8.57], ['CGN', 50.87, 7.14], ['TPE', 25.08, 121.23], ['NRT', 35.77, 140.39]];
await tryit('adsb.lol hubs', async () => {
  const out = [];
  for (const [n, la, lo] of hubs) {
    const t0 = Date.now(); const r = await fetch(`https://api.adsb.lol/v2/point/${la}/${lo}/100`);
    let j = {}; try { j = await r.json(); } catch {}
    const ac = j.ac || [];
    const cs = ac.map((a) => (a.flight || '').trim().slice(0, 3)).filter(Boolean);
    const top = Object.entries(cs.reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 12).map((x) => x.join(':')).join(' ');
    out.push(`${n} ${r.status} ${ac.length} ${Date.now() - t0}ms ground=${ac.filter((a) => a.alt_baro === 'ground').length} :: ${top}`);
    await sleep(1100);
  }
  return out.join('\n');
});
