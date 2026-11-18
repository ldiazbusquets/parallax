const { chromium } = require('playwright');
const fs = require('fs'); fs.mkdirSync('shots', { recursive: true });
(async () => { const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1600, height: 1000 } });
  const net = []; p.on('response', (r) => { if (/raw\.githubusercontent|snap\/(mil|cargo)/.test(r.url())) net.push(r.status() + ' ' + r.url().replace(/\?.*/, '')); });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('https://ldiazbusquets.github.io/parallax/#/w/geo', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {}); await p.waitForTimeout(8000);
  const before = await p.$$eval('.maplayers .btn', (b) => b.map((x) => x.textContent));
  await p.evaluate(() => [...document.querySelectorAll('.maplayers .btn')].find((b) => /Military/.test(b.textContent))?.click());
  await p.waitForTimeout(7000);
  const after = await p.$$eval('.maplayers .btn', (b) => b.map((x) => x.textContent));
  const el = await p.$('#p-map'); if (el) await el.screenshot({ path: 'shots/mil.png' });
  // click a plane: zoom on the US east coast where there are many
  await p.evaluate(() => window.__pxMap && window.__pxMap.jumpTo({ center: [-77, 38.5], zoom: 5.5 })); await p.waitForTimeout(4000);
  if (el) await el.screenshot({ path: 'shots/mil-us.png' });
  fs.writeFileSync('shots/log.txt', [JSON.stringify(before), JSON.stringify(after), ...net, 'ERR ' + errs.join(' | ')].join('\n'));
  await br.close(); })();
