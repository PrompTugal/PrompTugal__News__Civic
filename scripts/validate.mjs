// Gate: fails the build on any problem. Never weaken a check to get a release out.
// From scripts/validate.mjs in the site repositories made by sites@AgentiCCells.dinis
// (2026-11-16); factory@ added the hub.json fields, the description check and the
// placeholder check (a seeded site must hold no __SITE_*__ placeholder).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { CSP_META } from './csp.mjs';
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const problems = [];
const fail = m => problems.push(m);
const hype = /\b(revolutionary|cutting[- ]edge|seamless(?:ly)?|world[- ]class|game[- ]changing)\b/i;
const isTemplate = existsSync('.factory-template');
if (!existsSync('_site')) { console.error('FAILED: _site/ is not built: run node scripts/build.mjs'); process.exit(1); }
const files = walk('_site');
for (const f of [...files, 'hub.json', 'README.md']) {
  if (!existsSync(f) || !/\.(html|js|css|json|md)$/.test(f)) continue;
  const s = readFileSync(f, 'utf8');
  s.split('\n').forEach((line, i) => {
    if (line.includes('—')) fail(`${f}:${i + 1}: em dash`);
    const m = line.match(hype); if (m) fail(`${f}:${i + 1}: hype word "${m[0]}"`);
    if (!isTemplate && /__SITE_[A-Z]+__/.test(line)) fail(`${f}:${i + 1}: template placeholder left in a seeded site`);
  });
  if (f.endsWith('.html')) {
    if (!/<title>[^<]+<\/title>/.test(s)) fail(`${f}: no <title>`);
    if (!/<meta name="description" content="[^"]+"/.test(s)) fail(`${f}: no description`);
    if (!/<html lang="/.test(s)) fail(`${f}: no lang on <html>`);
    for (const m of s.matchAll(/<script[^>]+src="([^"]+)"/g)) if (/^(https?:)?\/\//.test(m[1])) fail(`${f}: third-party script ${m[1]}`);
    for (const m of s.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) if (/^(https?:)?\/\//.test(m[1])) fail(`${f}: third-party stylesheet ${m[1]}`);
    for (const m of s.matchAll(/(?:href|src)="([^"#?]+)/g)) {
      const u = m[1]; if (/^(https?:|mailto:|data:|\/\/)/.test(u)) continue;
      const target = u.startsWith('/') ? join('_site', u) : join(dirname(f), u);
      if (!existsSync(target) && !existsSync(join(target, 'index.html'))) fail(`${f}: broken link ${u}`);
    }
  }
}
// civic@PrompTugal.dinis (2026-11-17): the estate's standard. Every page has a markdown twin, shows the
// version and says it is independent; llms.txt exists.
for (const f of files.filter(f => f.endsWith('index.html'))) {
  if (!existsSync(f.replace(/index\.html$/, 'index.md'))) fail(`${f}: no markdown twin index.md`);
  const s = readFileSync(f, 'utf8');
  if (!/Version (dev|v\d+\.\d+\.\d+|__VERSION__)/.test(s)) fail(`${f}: no version shown`);
  if (!s.includes('Not a government or official site')) fail(`${f}: no independence label`);
}
if (!isTemplate && !existsSync('_site/llms.txt')) fail('no llms.txt');
// civic.b@ (2026-11-18), from civic.b.security@'s pre-review: the live script builds the DOM safely and reaches one host only.
if (files.some(f => f.endsWith('index.html') && readFileSync(f, 'utf8').includes('/assets/live/contracts.js')) && !existsSync('_site/assets/live/contracts.js')) fail('a page loads /assets/live/contracts.js, which is missing');
if (existsSync('_site/assets/live/contracts.js')) {
  const js = readFileSync('_site/assets/live/contracts.js', 'utf8').replace(/^\s*(\/\*[\s\S]*?\*\/|\/\/.*)$/gm, '');
  // a tripwire, not a boundary: it catches the obvious, not a determined author
  if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|\bFunction\(|srcdoc|sendBeacon|new Image|\bimport\(|location\s*=/.test(js)) fail('assets/live/contracts.js: unsafe DOM or dynamic code');
  const hosts = [...new Set([...js.matchAll(/(?:https?|wss?):\/\/([^\/'"`\s?#]+)/gi)].map(m => m[1].toLowerCase()))].filter(h => !['www.base.gov.pt', 'dados.gov.pt'].includes(h));
  if (hosts.join() !== 'data.promptugal.news') fail(`assets/live/contracts.js: fetches from ${hosts.join(', ') || 'nowhere'}, expected data.promptugal.news only`);
}
// civic.b@PrompTugal.dinis (2026-11-18), Dinis's word of 18 Nov 2026 (~14:25 UTC): every piece of data carries a licence link.
// Each page names the licence of every source it lists, and of our own work; each API file and each of its sources has a license.
for (const f of files.filter(f => f.endsWith('index.html'))) {
  const s = readFileSync(f, 'utf8');
  if (!s.includes('creativecommons.org/licenses/by/4.0/')) fail(`${f}: no link to our licence (CC BY 4.0)`);
  if (!s.includes('class="takedown"')) fail(`${f}: no take-down disclaimer (Dinis, 18 Nov 2026)`);
  const m = s.match(/<h2 id="sources">Sources<\/h2>\n<ul>(.*?)<\/ul>/s);
  if (m) for (const li of m[1].split('<li>').slice(1)) if (!/licence: /.test(li)) fail(`${f}: a source without its licence`);
}
for (const f of files.filter(f => f.startsWith(join('_site', 'api')) && f.endsWith('.json'))) {
  let d; try { d = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { fail(`${f}: not JSON`); continue; }
  if (f.endsWith('openapi.json')) { if (!d.info || !d.info.license) fail(`${f}: no info.license`); continue; }
  if (!d.license) fail(`${f}: no license`);
  for (const x of d.sources || []) if (!x.license) fail(`${f}: a source without a license`);
}
// civic.b@PrompTugal.dinis (2026-11-18), from civic.b.security@'s pre- and post-review: every page carries exactly the
// policy in scripts/csp.mjs, once, before any script, style or link; every script is an external same-origin file under
// /assets/; no element has an event-handler attribute. Tags are read quote-aware, so '>' inside an attribute does not end one.
const TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
for (const f of files.filter(f => f.endsWith('.html'))) {
  const s = readFileSync(f, 'utf8');
  const at = s.indexOf(CSP_META);
  if (at < 0) { fail(`${f}: no Content-Security-Policy, or not the one in scripts/csp.mjs`); continue; }
  if ((s.match(/http-equiv\s*=\s*["']?content-security-policy/gi) || []).length !== 1) fail(`${f}: more than one Content-Security-Policy`);
  const first = s.search(/<(script|style|link)\b/i);
  if (first >= 0 && first < at) fail(`${f}: the Content-Security-Policy comes after a script, style or link`);
  for (const m of s.matchAll(TAG)) {
    const name = m[1].toLowerCase(), attrs = {};
    for (const a of (m[2] || '').matchAll(ATTR)) attrs[a[1].toLowerCase()] = (a[2] || '').replace(/^["']|["']$/g, '');
    for (const k of Object.keys(attrs)) if (/^on/.test(k)) fail(`${f}: <${name} ${k}=...>: an event-handler attribute (blocked by script-src 'self')`);
    if (name === 'script' && !/^\/assets\/[a-z0-9\/._-]+\.js$/i.test(attrs.src || '')) fail(`${f}: a <script> that is not an external file under /assets/ (${attrs.src || 'inline'})`);
  }
}
// civic.b@PrompTugal.dinis (2026-11-19): the sites bar and the time-zone table are checked against the live registry at build
// (scripts/build.mjs; no pin is kept in this repository, security@'s option 1). Here: a page that loads the bar loads one
// vendored version that exists in _site, and the registry snapshot (sites only) is there; a stale one is a warning.
{
  const vers = new Set();
  for (const f of files.filter(f => f.endsWith('.html'))) for (const m of readFileSync(f, 'utf8').matchAll(/\/assets\/sites-bar\/(\d+\.\d+\.\d+)\/sites-bar\.(js|css)/g)) vers.add(m[1]);
  if (vers.size > 1) fail(`pages load more than one sites bar version: ${[...vers].join(', ')}`);
  for (const v of vers) for (const x of ['js', 'css']) if (!existsSync(`_site/assets/sites-bar/${v}/sites-bar.${x}`)) fail(`sites bar ${v}: _site/assets/sites-bar/${v}/sites-bar.${x} missing`);
  if (!existsSync('data/sites-registry.json')) fail('data/sites-registry.json missing: the CSP has no list of sister sites');
  else { const age = (Date.now() - Date.parse(JSON.parse(readFileSync('data/sites-registry.json', 'utf8')).read_at)) / 864e5; if (!(age <= 14)) console.warn(`WARNING data/sites-registry.json is ${Math.round(age)} days old`); }
  if (/integrity/i.test(readFileSync('data/sites-registry.json', 'utf8'))) fail('data/sites-registry.json holds a pin: keep the sites only (pins are read from the live registry)');
}
// civic.b@PrompTugal.dinis (2026-11-19, security pre-review): the councils' notices keep a fixed set of fields, only
// validated links (Diário da República PDFs, Portal BASE records), no tender-platform links, and no text where a person may be named.
// every year's file, found by name, so a new year is never left unchecked (post-review, 19 Nov 2026)
for (const NF of readdirSync('data/procurement').filter(f => /^notices-20\d{2}\.json$/.test(f)).sort().map(f => `data/procurement/${f}`)) {
  const N = JSON.parse(readFileSync(NF, 'utf8')), NB = NF.split('/').pop();
  const KEYS = new Set(['n', 'council', 'kind', 'published', 'deadline', 'procedure', 'types', 'what', 'base_price', 'base_stated', 'dr', 'changes', 'base_price_last', 'contracts']);
  const CKEYS = new Set(['id', 'price', 'base_price', 'published', 'signed', 'url']);
  const DRU = /^https:\/\/files\.diariodarepublica\.pt\/[A-Za-z0-9_\/.-]{1,200}\.pdf$/, BGU = /^https:\/\/www\.base\.gov\.pt\/Base4\/pt\/detalhe\/\?type=contratos&id=\d{1,12}$/;
  const num = v => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e10);
  const TOP = new Set(['source', 'license', 'councils', 'count', 'procedures']), CHK = new Set(['n', 'published', 'base_price', 'deadline', 'dr']);
  const COUNCILS = new Set(Object.keys(N.councils || {})), KINDS = new Set(['procedure', 'urgent', 'other']);
  const dayOk = v => v === null || (typeof v === 'string' && /^20(2[5-7])-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v);
  const txt = v => typeof v === 'string' && v.length <= 300 && !/[\u0000-\u001f\u202a-\u202e\u2066-\u2069<>`]|@/.test(v);
  for (const k of Object.keys(N)) if (!TOP.has(k)) fail(`${NB}: unexpected top-level field ${k.slice(0, 40)}`);
  if (COUNCILS.size !== 16) fail(`${NB}: the 16 councils are not listed`);
  for (const x of N.procedures || []) {
    const at = `${NB} ${String(x.n).slice(0, 20)}`;
    if (!COUNCILS.has(x.council)) fail(`${at}: council`);
    if (!KINDS.has(x.kind)) fail(`${at}: kind`);
    if (!dayOk(x.published) || !dayOk(x.deadline)) fail(`${at}: date`);
    if (!txt(x.procedure) || !Array.isArray(x.types) || x.types.length > 5 || !x.types.every(txt)) fail(`${at}: procedure or types`);
    for (const c of x.changes || []) { for (const k of Object.keys(c)) if (!CHK.has(k)) fail(`${at}: unexpected change field ${k.slice(0, 40)}`); if (!dayOk(c.published) || !dayOk(c.deadline) || !num(c.base_price)) fail(`${at}: change notice values`); }
    for (const c of x.contracts || []) if (!dayOk(c.published) || !dayOk(c.signed)) fail(`${at}: contract date`);
    for (const k of Object.keys(x)) if (!KEYS.has(k)) fail(`${at}: unexpected field ${k.slice(0, 40)}`);
    if (!/^\d{1,6}\/20\d{2}$/.test(x.n)) fail(`${at}: notice number`);
    if (x.dr !== null && !DRU.test(x.dr)) fail(`${at}: Diário da República link not allowed`);
    if (!num(x.base_price) || !num(x.base_price_last)) fail(`${at}: base price`);
    if (x.what !== null && !txt(x.what)) fail(`${at}: text`);
    for (const c of x.contracts || []) { for (const k of Object.keys(c)) if (!CKEYS.has(k)) fail(`${at}: unexpected contract field ${k.slice(0, 40)}`);
      if (!BGU.test(c.url) || !num(c.price)) fail(`${at}: contract ${String(c.id).slice(0, 14)}`); }
    for (const c of x.changes || []) if (c.dr !== null && !DRU.test(c.dr)) fail(`${at}: change notice link not allowed`);
  }
  if (/PecasProcedimento|vortal|acingov|anogov|saphety/i.test(readFileSync(NF, 'utf8'))) fail(`${NB}: a tender-platform link or field is kept`);
}
if (!existsSync('_site/version.json')) fail('no version.json');
if (!existsSync('_site/index.html')) fail('no index.html');
try {
  const h = JSON.parse(readFileSync('hub.json', 'utf8'));
  for (const k of ['name', 'what_it_does', 'owner', 'repository', 'live_address', 'version_from']) if (typeof h[k] !== 'string' || !h[k].trim()) fail(`hub.json: ${k} must be a non-empty string`);
  if (h.version_from !== `${h.live_address}/version.json`) fail(`hub.json: version_from must be ${h.live_address}/version.json (the hub copies it verbatim)`);
  if (h.owner !== 'AgentiCCells') fail('hub.json: owner must be AgentiCCells');
  if (!h.licence || h.licence.code !== 'Apache-2.0' || h.licence.text !== 'CC BY 4.0') fail('hub.json: licence must be code Apache-2.0, text CC BY 4.0');
} catch (e) { fail(`hub.json is missing or not JSON (${e.message})`); }
if (problems.length) { console.error(problems.join('\n')); console.error(`FAILED: ${problems.length} problem(s)`); process.exit(1); }
console.log(`OK${isTemplate ? ' (template)' : ''}`);
