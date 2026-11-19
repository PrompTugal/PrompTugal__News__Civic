// Check that every host the pages reach at run time is allowed by scripts/csp.mjs (civic.b@PrompTugal.dinis, 18 Nov 2026,
// from civic.b.security@'s post-review). obs.js reads its geo lookup list from promptugal.news's obs.json (config_from), so
// that list can change without a commit here; a new host then fails closed (no place recorded) and nobody would notice.
// Run at each wake:  node tools/check-csp-hosts.mjs   (network; prints OK or the missing hosts, exit 1 if any)
import { readFileSync } from 'node:fs';
import { CSP } from '../scripts/csp.mjs';
const connect = (CSP.split('; ').find(d => d.startsWith('connect-src ')) || '').split(' ').slice(1);
const exact = new Set(connect.filter(x => x.startsWith('https://') && !x.includes('*')).map(x => new URL(x).host));
const wild = connect.filter(x => x.startsWith('https://*.')).map(x => x.slice('https://*'.length));   // e.g. '.promptugal.news'
const allowed = { has: h => exact.has(h) || wild.some(w => h.endsWith(w)) };
const own = JSON.parse(readFileSync(new URL('../src/assets/obs/obs.json', import.meta.url), 'utf8'));
const need = new Map([[new URL(own.endpoint).host, 'obs endpoint'], [new URL(own.config_from).host, 'obs config_from'], ['data.promptugal.news', 'live contracts']]);
const r = await fetch(own.config_from, { cache: 'no-cache' }); if (!r.ok) { console.error(`could not read ${own.config_from}: ${r.status}`); process.exit(2); }
const shared = JSON.parse(await r.text());
for (const u of (own.geo || shared.geo || [])) need.set(new URL(u).host, 'obs geo list');
const missing = [...need].filter(([h]) => !allowed.has(h));
if (missing.length) { console.error('Not allowed by connect-src in scripts/csp.mjs: ' + missing.map(([h, w]) => `${h} (${w})`).join(', ')); process.exit(1); }
console.log(`OK (${need.size} hosts: ${[...need.keys()].join(', ')})`);
