const { chromium } = require('playwright'); const fs = require('fs');
(async () => { fs.mkdirSync('shots', { recursive: true }); const b = await chromium.launch();
  for (const [n, w, h] of [['status', 1280, 900], ['status-phone', 390, 844]]) { const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('https://ldiazbusquets.github.io/status/?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(5000);
    await p.screenshot({ path: `shots/${n}.png`, fullPage: true }); }
  await b.close(); })();
