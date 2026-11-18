// "Live flights" job: refreshes cargo and military aircraft every couple of minutes and force-pushes them to the
// repo's `flights` branch (one commit, data only), which the website reads from raw.githubusercontent.com.
// Run by .github/workflows/flights.yml with vite-node; FLIGHTS_OUT is a git checkout whose origin can be pushed to.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchCargo, fetchMil } from '../src/data/trade';

const OUT = process.env.FLIGHTS_OUT ?? 'flights-out';
const MINUTES = Number(process.env.FLIGHTS_MINUTES ?? 330);
const MIL_EVERY = 90_000, CARGO_EVERY = 4 * 60_000;   // adsb.lol is a free community API: ~1 request a minute on average
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const git = (...a: string[]) => execFileSync('git', ['-C', OUT, ...a], { stdio: 'pipe' }).toString().trim();
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function save(name: string, data: unknown, generated: number) {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, name), JSON.stringify({ generated, data }));
}
let first = true;
function publish(msg: string) {
  git('add', '-A');
  if (first) { git('commit', '-q', '-m', msg); first = false; } else git('commit', '-q', '--amend', '-m', msg);  // keep the branch to one commit
  git('push', '-q', '-f', 'origin', 'HEAD:flights');
}

const end = Date.now() + MINUTES * 60_000;
let nextCargo = 0;
while (Date.now() < end) {
  const t0 = Date.now(), done: string[] = [];
  try { const m = await fetchMil(); await save('mil.json', m, m.at); done.push(`${m.planes.length} military`); } catch (e) { log('mil', (e as Error).message); }
  if (Date.now() >= nextCargo) {
    nextCargo = Date.now() + CARGO_EVERY;
    try { const c = await fetchCargo(3000); await save('cargo.json', c, c.at); done.push(`${c.planes.length} cargo`); } catch (e) { log('cargo', (e as Error).message); }
  }
  if (done.length) { try { publish(`Flights ${new Date().toISOString().slice(0, 16)}Z: ${done.join(', ')}`); log('published', done.join(', ')); } catch (e) { log('push failed', (e as Error).message); } }
  await sleep(Math.max(5_000, MIL_EVERY - (Date.now() - t0)));
}
