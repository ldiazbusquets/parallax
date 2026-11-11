const CARGO = /^(FDX|UPS|GTI|CLX|CKS|ABX|ATN|BCS|DHK|DHX|AHK|BOX|GEC|CAO|CKK|CSS|YZR|NCA|MPH|SQC|PAC|NCR|WGN|TAY|SWN|ICL|MSX|CJT|SCX|KYE|AJT|ABD)\d/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let all = new Map();
for (const t of ['MD11', 'A306', 'B763', 'B77L', 'B748', 'B744', 'B752', 'B762', 'A332', 'B738', 'B734', 'A321', 'B77W', 'DC10', 'B74F', 'ATP', 'AT76', 'C208']) {
  try { const r = await fetch('https://api.adsb.lol/v2/type/' + t); const j = await r.json(); const ac = j.ac || []; const c = ac.filter((a) => CARGO.test((a.flight || '').trim()));
    c.forEach((a) => all.set(a.hex, a)); console.log(t, r.status, 'all', ac.length, 'cargo', c.length, [...new Set(c.map((a) => a.flight.trim().slice(0, 3)))].join(' '));
  } catch (e) { console.log(t, 'ERR', String(e)); }
  await sleep(3000);
}
console.log('unique cargo aircraft worldwide', all.size, 'airborne', [...all.values()].filter((a) => a.alt_baro !== 'ground').length);
for (const u of ['https://re-api.adsb.lol/?all', 'https://api.adsb.lol/v2/all', 'https://opendata.adsb.fi/api/v2/all']) { try { const r = await fetch(u); const t = await r.text(); console.log(u, r.status, t.length, t.slice(0, 120)); } catch (e) { console.log(u, 'ERR', String(e)); } await sleep(2000); }
