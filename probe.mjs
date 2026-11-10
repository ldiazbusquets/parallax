const PW = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services';
const ago = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
async function arc(svc, params) { const out = []; let pages = 0; for (let off = 0; off < 30000;) { const t0 = Date.now(); const r = await fetch(`${PW}/${svc}/FeatureServer/0/query?` + new URLSearchParams({ f: 'json', returnGeometry: 'false', resultOffset: String(off), resultRecordCount: '1000', ...params })); const j = await r.json(); pages++; if (j.error) { console.log('ERR', JSON.stringify(j.error)); break; } const rows = (j.features || []).map((f) => f.attributes); out.push(...rows); console.log(svc, 'page', pages, rows.length, Date.now() - t0, 'ms', j.exceededTransferLimit); if (!j.exceededTransferLimit || !rows.length) break; off += rows.length; } return out; }
let t = Date.now();
const db = await arc('PortWatch_ports_database', { where: '1=1', outFields: 'portid,portname,country,ISO3,lat,lon,vessel_count_total', orderByFields: 'vessel_count_total DESC', resultRecordCount: '30' });
console.log('db', db.length, Date.now() - t); t = Date.now();
const ids = db.slice(0, 30).map((r) => `'${r.portid}'`).join(',');
const rows = await arc('Daily_Ports_Data', { where: `portid IN (${ids}) AND ((date >= DATE '${ago(120)}') OR (date >= DATE '${ago(400)}' AND date <= DATE '${ago(345)}'))`, outFields: 'portid,date,portcalls,import,export', orderByFields: 'date,portid' });
console.log('ports rows', rows.length, Date.now() - t); t = Date.now();
const ch = await arc('Daily_Chokepoints_Data', { where: `date >= DATE '${ago(400)}'`, outFields: 'portid,date,n_total,n_tanker,n_container,n_dry_bulk,capacity', orderByFields: 'date,portid' });
console.log('choke rows', ch.length, Date.now() - t);
