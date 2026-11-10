const UA = { 'User-Agent': process.env.SEC_USER_AGENT || 'Parallax research parallax@example.com', 'Accept-Encoding': 'gzip, deflate' };
const sec = async (u, text) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(u + ' ' + r.status); return text ? r.text() : r.json(); };
const show = (label, x) => console.log('\n=== ' + label + '\n' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 2500));
const tryit = async (label, fn) => { try { show(label, await fn()); } catch (e) { show(label + ' ERROR', String(e)); } };

await tryit('AAPL 13D/G forms', async () => {
  const s = await sec('https://data.sec.gov/submissions/CIK0000320193.json'); const r = s.filings.recent; const out = [];
  for (let i = 0; i < r.form.length; i++) if (/13[DG]/.test(r.form[i])) out.push([r.form[i], r.filingDate[i], r.accessionNumber[i], r.primaryDocument[i]]);
  return out.slice(0, 12);
});
await tryit('13G primary doc', async () => {
  const s = await sec('https://data.sec.gov/submissions/CIK0001045810.json'); const r = s.filings.recent;
  const i = r.form.findIndex((f) => /^SCHEDULE 13G/.test(f)); if (i < 0) return 'none in NVDA';
  const acc = r.accessionNumber[i].replace(/-/g, ''), doc = r.primaryDocument[i];
  const idx = await sec(`https://www.sec.gov/Archives/edgar/data/1045810/${acc}/index.json`);
  const x = await sec(`https://www.sec.gov/Archives/edgar/data/1045810/${acc}/${doc.replace(/^xsl[^/]+\//, '')}`, true);
  return JSON.stringify({ form: r.form[i], doc, files: idx.directory.item.map((f) => f.name) }) + '\n' + x.slice(0, 3000);
});
await tryit('13D primary doc (any)', async () => {
  for (const cik of ['0000320193','0001652044','0000021344','0001018724','0001318605','0000051143','0001067983','0000200406','0000034088','0000078003','0001326801','0001800227','0001090872']) {
    const s = await sec(`https://data.sec.gov/submissions/CIK${cik}.json`); const r = s.filings.recent;
    const i = r.form.findIndex((f) => /13D/.test(f)); if (i < 0) continue;
    const acc = r.accessionNumber[i].replace(/-/g, ''), doc = r.primaryDocument[i];
    const x = await sec(`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${doc.replace(/^xsl[^/]+\//, '')}`, true);
    return cik + ' ' + r.form[i] + ' ' + doc + '\n' + x.slice(0, 2500);
  }
  return 'none';
});
await tryit('Berkshire 13F', async () => {
  const s = await sec('https://data.sec.gov/submissions/CIK0001067983.json'); const r = s.filings.recent;
  const i = r.form.findIndex((f) => f === '13F-HR'); const acc = r.accessionNumber[i].replace(/-/g, '');
  const idx = await sec(`https://www.sec.gov/Archives/edgar/data/1067983/${acc}/index.json`);
  const files = idx.directory.item.map((f) => f.name);
  const info = files.find((f) => /\.xml$/i.test(f) && !/primary_doc/i.test(f));
  const x = await sec(`https://www.sec.gov/Archives/edgar/data/1067983/${acc}/${info}`, true);
  return JSON.stringify({ date: r.filingDate[i], report: r.reportDate[i], files }) + '\n' + x.slice(0, 1500);
});
await tryit('OpenFIGI', async () => {
  const r = await fetch('https://api.openfigi.com/v3/mapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(['037833100','02079K305','084670702','G1151C101','11135F101','594918104','00724F101','17275R102','46625H100','60871R209','30303M102'].map((c) => ({ idType: 'ID_CUSIP', idValue: c, exchCode: 'US' }))) });
  return r.status + ' ' + JSON.stringify([...r.headers].filter(([k]) => /ratelimit|limit/i.test(k))) + '\n' + JSON.stringify((await r.json()).map((x) => x.data?.[0]?.ticker ?? x.error ?? x.warning));
});
for (const [label, u] of [['adsb.lol MEM', 'https://api.adsb.lol/v2/point/35.04/-89.98/250'], ['airplanes.live MEM', 'https://api.airplanes.live/v2/point/35.04/-89.98/250'], ['adsb.fi MEM', 'https://opendata.adsb.fi/api/v2/lat/35.04/lon/-89.98/dist/250'], ['opensky', 'https://opensky-network.org/api/states/all?lamin=34&lomin=-91&lamax=36&lomax=-89']]) {
  await tryit(label, async () => {
    const r = await fetch(u, { headers: { Origin: 'https://ldiazbusquets.github.io' } }); const t = await r.text();
    let n = '?', cs = [];
    try { const j = JSON.parse(t); const ac = j.ac ?? j.aircraft ?? j.states ?? []; n = ac.length; cs = ac.map((a) => (a.flight ?? a[1] ?? '').trim()).filter((c) => /^(FDX|UPS|GTI|CLX|CKS|ABX|ATN|BCS|DHK|DAE)/.test(c)); } catch {}
    return `${r.status} acao=${r.headers.get('access-control-allow-origin')} n=${n} cargo=${cs.join(',')}\n${t.slice(0, 600)}`;
  });
}
const PW = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services';
await tryit('PortWatch services', async () => { const j = await (await fetch(PW + '?f=json')).json(); return j.services.map((s) => s.name).join(', '); });
await tryit('Daily_Ports_Data fields', async () => { const j = await (await fetch(PW + '/Daily_Ports_Data/FeatureServer/0?f=json')).json(); return j.fields.map((f) => f.name).join(', '); });
await tryit('Daily_Ports_Data sample', async () => { const j = await (await fetch(PW + `/Daily_Ports_Data/FeatureServer/0/query?f=json&where=portname%3D%27Shanghai%27&outFields=*&orderByFields=date%20DESC&resultRecordCount=2&returnGeometry=false`)).json(); return j; });
await tryit('Ports db fields', async () => { const j = await (await fetch(PW + '/PortWatch_ports_database/FeatureServer/0?f=json')).json(); return j.fields.map((f) => f.name).join(', '); });
await tryit('Ports db top', async () => { const j = await (await fetch(PW + `/PortWatch_ports_database/FeatureServer/0/query?f=json&where=1%3D1&outFields=*&orderByFields=vessel_count_total%20DESC&resultRecordCount=3&returnGeometry=false`)).json(); return j; });
await tryit('Ports count', async () => { const j = await (await fetch(PW + `/PortWatch_ports_database/FeatureServer/0/query?f=json&where=1%3D1&returnCountOnly=true`)).json(); return j; });
