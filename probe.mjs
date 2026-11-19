import { execSync } from 'node:child_process';
execSync('curl -sSL -o /tmp/a.csv.gz https://github.com/wiedehopf/tar1090-db/raw/csv/aircraft.csv.gz && ls -la /tmp/a.csv.gz', { stdio: 'inherit' });
const sh = (c) => console.log('\n$ ' + c + '\n' + execSync(c, { shell: '/bin/bash', maxBuffer: 1e8 }).toString());
sh('zcat /tmp/a.csv.gz | head -3');
sh('zcat /tmp/a.csv.gz | wc -l');
for (const t of ['B77L', 'B748', 'B744', 'B763', 'A332', 'B738', 'B752', 'MD11', 'A306', 'B77W', 'B762']) sh(`zcat /tmp/a.csv.gz | awk -F';' '$3=="${t}"{print $5}' | sort | uniq -c | sort -rn | head -25`);
sh(`zcat /tmp/a.csv.gz | grep -E ';(HL8285|B-16787|A6-EFD|A7-BFA|N418MC|B-LJA);'`);
