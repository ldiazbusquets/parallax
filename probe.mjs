import { chromium } from 'playwright';
const B = 'https://ldiazbusquets.github.io/parallax/';
const c = await (await fetch(B + 'snap/cargo.json?t=' + Date.now())).json(); console.log('cargo', c.data.planes.length, new Date(c.generated).toISOString());
const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(B + '?v=' + Date.now() + '#/w/geo'); await p.waitForTimeout(12000);
await p.locator('#p-map').getByText(/^Cargo/).first().click(); await p.waitForTimeout(6000);
await p.locator('#p-map').screenshot({ path: 'shots/cargo2.png' });
await br.close();
