// Check that every host the pages reach at run time is allowed by scripts/csp.mjs (civic.b@PrompTugal.dinis, 18 Nov 2026;
// since 19 Nov 2026 obs.js reads nothing from another site and makes no location lookup, so this needs no network).
// Run at each wake:  node tools/check-csp-hosts.mjs   (prints OK or the missing hosts, exit 1 if any)
import { readFileSync } from 'node:fs';
import { CSP } from '../scripts/csp.mjs';
const connect = (CSP.split('; ').find(d => d.startsWith('connect-src ')) || '').split(' ').slice(1);
const exact = new Set(connect.filter(x => x.startsWith('https://') && !x.includes('*')).map(x => new URL(x).host));
const wild = connect.filter(x => x.startsWith('https://*.')).map(x => x.slice('https://*'.length));   // e.g. '.promptugal.news'
const allowed = { has: h => exact.has(h) || wild.some(w => h.endsWith(w)) };
const own = JSON.parse(readFileSync(new URL('../src/assets/obs/obs.json', import.meta.url), 'utf8'));
const need = new Map([[new URL(own.endpoint).host, 'obs endpoint'], ['data.promptugal.news', 'live contracts']]);
const missing = [...need].filter(([h]) => !allowed.has(h));
if (missing.length) { console.error('Not allowed by connect-src in scripts/csp.mjs: ' + missing.map(([h, w]) => `${h} (${w})`).join(', ')); process.exit(1); }
console.log(`OK (${need.size} hosts: ${[...need.keys()].join(', ')})`);
