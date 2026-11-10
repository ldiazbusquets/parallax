const B = 'https://ldiazbusquets.github.io/parallax/';
const j = async (f) => (await (await fetch(B + 'snap/' + f + '?t=' + Date.now())).json()).data;
const out = [];
try {
  const co = await j('companies.json'); out.push('companies.json ' + co.length);
  for (const t of ['AAPL', 'BRK_B', 'LIN', 'COST', 'KO']) { try { const d = await j(`co/${t}.json`); out.push(`${t} ${d.name} insiders=${d.insiders.length} stakes=${JSON.stringify((d.stakes || []).slice(0, 4).map((s) => [s.filer, s.form, s.pct, s.filed]))}`); } catch (e) { out.push(t + ' missing'); } }
  const f = await j('funds.json'); for (const x of f.funds) out.push(`fund ${x.name} ${x.period} ${x.holdings.length} mapped=${x.holdings.filter((h) => h.t).length} top=${x.holdings.slice(0, 3).map((h) => h.t + ':' + h.pct.toFixed(1)).join(',')}`); out.push('fund errors ' + JSON.stringify(f.errors));
  const n = await j('network.json'); out.push('13D holders ' + JSON.stringify(n.holders.filter((h) => h.kind === '13D').map((h) => h.name + '>' + h.links.map((l) => l.ticker).join('/')).slice(0, 15)));
  const c = await j('cargo.json'); out.push('cargo ' + JSON.stringify(c.hubs));
  const s = await j('season.json'); out.push('season ' + JSON.stringify({ all: s.all, large: s.large, weeks: s.weeks.length, beats: s.beats.slice(0, 3).map((e) => e.symbol) }));
} catch (e) { out.push('ERR ' + e); }
console.log(out.join('\n'));
import { chromium } from 'playwright';
const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1440, height: 900 } });
const shot = async (url, name, fn) => { await p.goto(B + url); await p.waitForTimeout(9000); if (fn) { await fn(); await p.waitForTimeout(2500); } await p.screenshot({ path: `shots/${name}.png`, fullPage: true }); };
await shot('#/w/companies', 'link-funds', async () => { await p.locator('#p-link').getByText('Funds & activists', { exact: true }).first().click(); });
await shot('#/w/geo', 'geo-risk', async () => { await p.waitForTimeout(8000); await p.locator('#p-shipping').getByText('Risk', { exact: true }).first().click(); await p.waitForTimeout(3000); });
await shot('#/w/geo', 'geo-ports', async () => { await p.waitForTimeout(6000); await p.locator('#p-shipping').getByText('Ports', { exact: true }).first().click(); await p.locator('#p-map').getByText(/^Cargo flights/).first().click(); });
await shot('#/w/companies', 'companies');
await br.close();
