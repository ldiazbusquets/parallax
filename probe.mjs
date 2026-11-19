for (const p of ['', 'finance/', 'lab/', 'health/', 'parallax/', 'terminal/', 'linux/', 'os/', 'archway-macro/', 'bankscope-ai/', 'retirement-sim/', 'ai/', 'remote/', 'admin/', 'budget/', 'dashboard/', 'status/']) {
  const u = 'https://ldiazbusquets.github.io/' + p, t = Date.now();
  try { const r = await fetch(u, { headers: { Origin: 'https://example.com' } }); const s = await r.text(); console.log(r.status, Date.now() - t + 'ms', u, 'acao=' + r.headers.get('access-control-allow-origin'), 'lm=' + r.headers.get('last-modified'), (s.match(/<title>([^<]*)/) || [])[1]); } catch (e) { console.log('ERR', u, String(e)); }
}
for (const r of ['parallax', 'finance', 'lab']) { const x = await fetch(`https://api.github.com/repos/ldiazbusquets/${r}/actions/runs?per_page=1`); const j = await x.json(); console.log(r, x.status, x.headers.get('access-control-allow-origin'), j.workflow_runs?.[0]?.name, j.workflow_runs?.[0]?.updated_at); }
