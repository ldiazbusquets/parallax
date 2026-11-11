import { chromium } from 'playwright';
const B = 'https://ldiazbusquets.github.io/parallax/';
const imf = await (await fetch(B + 'snap/imf.json?t=' + Date.now())).json(); console.log('imf', Object.keys(imf.data.data).length, imf.data.edition, JSON.stringify(imf.data.data.PRI?.NGDP_RPCH));
const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(B + '#/w/geo'); await p.waitForTimeout(12000);
for (const [iso, lat, lng] of [['PRI', 18.2, -66.5], ['GUF', 4, -53]]) {
  await p.evaluate(([iso, lat, lng]) => dispatchEvent(new CustomEvent('fintel:map-focus', { detail: { lat, lng, iso3: iso } })), [iso, lat, lng]);
  await p.waitForTimeout(6000); await p.locator('#p-map').screenshot({ path: `shots/${iso}.png` });
}
await p.evaluate(() => dispatchEvent(new CustomEvent('fintel:map-focus', { detail: { lat: 30, lng: 10, iso3: 'FRA' } })));
await p.waitForTimeout(5000);
await p.locator('#p-map').getByText(/^Cargo/).first().click(); await p.waitForTimeout(5000);
await p.locator('#p-map').screenshot({ path: 'shots/cargo.png' });
console.log('cargo btn', await p.locator('#p-map').getByText(/^Cargo/).first().textContent());
await br.close();
