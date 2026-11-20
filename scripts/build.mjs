// Build: copy src/ to _site/, stamp the version, write version.json.
// SITE_VERSION is set by CI only (v0.1.N); a local build says "dev".
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const version = process.env.SITE_VERSION || 'dev';
rmSync('_site', { recursive: true, force: true });
cpSync('src', '_site', { recursive: true });
// The registry, promptugal.news/api/v1/sites.json, read once at build (civic.b@PrompTugal.dinis; security@'s one ruling on
// registry pins, Website 5109e7a09, option 1: compare with the live registry, never copy a pin into this repository).
//   - the sites bar (dev@'s, vendored at BAR_VERSION) and the shared time-zone table (at TZ_VERSION) are used only when the
//     registry names that same version and every file's SRI matches it; the same version with other bytes stops the build;
//   - the registry naming a newer version, or not answering, ships this build without the bar and without a country
//     (the rest deploys), and the upgrade waits for the next wake (data.b@'s trap, 19 Nov 2026, relayed by conductor.b@);
//   - the list of sites the renderer accepts is kept in data/sites-registry.json (sites only, no pins), for the CSP.
// Data, not code: nothing from the registry is run.
const BAR_VERSION = '1.2.1', TZ_VERSION = '1.1.0';
// designer@'s shared map, ptmap (Dinis, 19 Nov 17:40 UTC: "the map is Portugal big with London and the EU small"), vendored
// from the Website repository's design/shared-map/v<MAP_VERSION>/ into src/assets/ptmap/<MAP_VERSION>/ and used only when
// the registry's map.versions["<v>"] gives its sha384 pins, the files match them, and its review reads "passed"
// (it reads "passed (security@ <commit>)"); the same version with other bytes stops the build. The pins are compared
// here at build, never written into the pages (events.b@'s pitfall, 5bf4a93: high-entropy attributes on every page).
const MAP_VERSION = '1.0.2';
const MAP = { js: `src/assets/ptmap/${MAP_VERSION}/ptmap.js`, css: `src/assets/ptmap/${MAP_VERSION}/ptmap.css` };
const BAR = { render: `vendor/sites-bar/${BAR_VERSION}/sites-bar-render.mjs`, css: `src/assets/sites-bar/${BAR_VERSION}/sites-bar.css`, js: `src/assets/sites-bar/${BAR_VERSION}/sites-bar.js` };
const TZ_FILE = `vendor/obs/tz-country/${TZ_VERSION}/tz-country.json`;
const { createHash } = await import('node:crypto');
const sri = f => 'sha256-' + createHash('sha256').update(readFileSync(f)).digest('base64');
const SRI = /^sha(256|384|512)-[A-Za-z0-9+/]{43,86}={0,2}$/;
let barOk = false, tzOk = false, mapOk = false;
{
  let reg = null;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10000);   // covers the headers and the whole body
  try {
    const r = await fetch('https://promptugal.news/api/v1/sites.json', { signal: ac.signal, redirect: 'error', headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('status ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 256 * 1024) throw new Error('too large');
    reg = JSON.parse(buf.toString('utf8'));
  } catch (e) { console.warn(`WARNING registry not read (${e.message}): no sites bar and no country in this build`); }
  finally { clearTimeout(t); }
  if (reg) {
    // the bar
    // dev@'s append-only per-version pins: bar.versions["<v>"] is the integrity map itself ({render, css, js}), or
    // { integrity: {...} }; the piece is switched off only when the registry no longer lists this site's version at all
    const b = reg.bar || {}, bv = b.versions && Object.prototype.hasOwnProperty.call(b.versions, BAR_VERSION) ? b.versions[BAR_VERSION] : null;
    const bOwn = bv && typeof bv === 'object' ? (bv.integrity && typeof bv.integrity === 'object' ? bv.integrity : bv) : null;
    if (bOwn || b.version === BAR_VERSION) {
      const raw = bOwn || b.integrity || {};
      // keys as the registry gives them today (render, css, js) or by file name (dev@'s planned reshape, integrity.<file>)
      const integ = { render: raw.render || raw['sites-bar-render.mjs'], css: raw.css || raw['sites-bar.css'], js: raw.js || raw['sites-bar.js'] };
      for (const k of ['render', 'css', 'js']) {
        if (typeof integ[k] !== 'string' || !SRI.test(integ[k])) { console.error(`sites bar ${BAR_VERSION}: the registry gives no valid integrity for ${k}`); process.exit(1); }
        if (sri(BAR[k]) !== integ[k]) { console.error(`sites bar ${BAR_VERSION}: ${BAR[k]} does not match the registry (same version, other bytes): stop`); process.exit(1); }
      }
      const { check } = await import('../' + BAR.render);
      if (check(reg)) {
        barOk = true;
        const ver = typeof reg.version === 'string' ? reg.version.slice(0, 40).replace(/[^\w.-]/g, '') : null;
        writeFileSync('data/sites-registry.json', JSON.stringify({ read_at: new Date().toISOString(), from: 'https://promptugal.news/api/v1/sites.json', registry_version: ver, license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', by: 'PrompTugal.news' }, registry: { sites: reg.sites } }, null, 1) + '\n');
        console.log(`sites bar ${BAR_VERSION}: the three files match the registry; ${reg.sites.length} sites, ${ver || 'no version'}`);
      } else console.warn('WARNING the renderer refused the registry: no sites bar in this build');
    } else console.warn(`sites bar ${BAR_VERSION} off: the registry names ${b.version || 'none'} and no longer lists ${BAR_VERSION}`);
    // the shared map
    {
      const m = reg.map || {}, mv = m.versions && Object.prototype.hasOwnProperty.call(m.versions, MAP_VERSION) ? m.versions[MAP_VERSION] : null;
      const integ = mv && typeof mv === 'object' && mv.integrity && typeof mv.integrity === 'object' ? mv.integrity : null;
      const review = mv && typeof mv.review === 'string' ? mv.review : '';   // this version's own review only (post-review low 2)
      const sri384 = f => 'sha384-' + createHash('sha384').update(readFileSync(f)).digest('base64');
      if (integ) {
        for (const [k, f] of [['ptmap.js', MAP.js], ['ptmap.css', MAP.css]]) {
          if (typeof integ[k] !== 'string' || !/^sha384-[A-Za-z0-9+/]{64}$/.test(integ[k])) { console.error(`ptmap ${MAP_VERSION}: the registry gives no valid sha384 for ${k}`); process.exit(1); }
          if (sri384(f) !== integ[k]) { console.error(`ptmap ${MAP_VERSION}: ${f} does not match the registry (same version, other bytes): stop`); process.exit(1); }
        }
        if (/^passed(?: \(security@ [0-9a-f]{7,40}\))?$/.test(review))   // "passed" or "passed (security@ <commit>)", nothing else (post-review low 1)
          { mapOk = true; console.log(`ptmap ${MAP_VERSION}: both files match the registry; review ${review.slice(0, 60)}`); }
        else console.warn(`WARNING ptmap ${MAP_VERSION}: review reads "${review.slice(0, 60)}", not passed: no map in this build`);
      } else console.warn(`ptmap ${MAP_VERSION} off: the registry does not list it`);
    }
    // the time-zone table
    // obs_tz.versions["<v>"] is { integrity: "sha256-..." } (or the string itself)
    const o = reg.obs_tz || {}, ov = o.versions && Object.prototype.hasOwnProperty.call(o.versions, TZ_VERSION) ? o.versions[TZ_VERSION] : null;
    // today { integrity: "sha256-..." }; after dev@'s planned reshape { integrity: { "tz-country.json": "sha256-..." } }
    const pick = x => typeof x === 'string' ? x : x && typeof x === 'object' ? (x['tz-country.json'] || (Object.keys(x).length === 1 ? Object.values(x)[0] : null)) : null;
    const oPin = (typeof ov === 'string' ? ov : ov && pick(ov.integrity)) || (o.version === TZ_VERSION ? pick(o.integrity) : null);
    if (oPin) {
      if (typeof oPin !== 'string' || !SRI.test(oPin)) { console.error('tz-country: the registry gives no valid integrity'); process.exit(1); }
      if (sri(TZ_FILE) !== oPin) { console.error(`tz-country ${TZ_VERSION}: does not match the registry (same version, other bytes): stop`); process.exit(1); }
      tzOk = true; console.log(`tz-country ${TZ_VERSION}: matches the registry`);
    } else console.warn(`tz-country ${TZ_VERSION} off: the registry names ${o.version || 'none'} and no longer lists ${TZ_VERSION}`);
  }
}
globalThis.CIVIC_SITES_BAR = { ok: barOk, version: BAR_VERSION, render: BAR.render };
globalThis.CIVIC_MAP = { ok: mapOk, version: MAP_VERSION };
if (!mapOk) rmSync('_site/assets/ptmap', { recursive: true, force: true });
// the time-zone table written into assets/obs/obs.js, so the page asks no one; an empty table (no country) when not verified
{
  const clean = {};
  if (tzOk) for (const [k, v] of Object.entries(JSON.parse(readFileSync(TZ_FILE, 'utf8')).zones || {})) if (/^[A-Za-z0-9_+\/-]{1,64}$/.test(k) && typeof v === 'string' && /^[A-Z]{2}$/.test(v)) clean[k] = v;
  const f = '_site/assets/obs/obs.js', js = readFileSync(f, 'utf8');
  if (!js.includes('__TZ_ZONES__')) { console.error('obs.js: no __TZ_ZONES__ to fill'); process.exit(1); }
  writeFileSync(f, js.replace('__TZ_ZONES__', JSON.stringify(clean)));
  console.log(`tz-country: ${Object.keys(clean).length} zones written into assets/obs/obs.js`);
}
const { generate } = await import('./generate.mjs');
console.log(`generated ${generate()} pages`);
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk('_site')) {
  if (!/\.(html|js|css|json|md|txt)$/.test(f)) continue;
  const s = readFileSync(f, 'utf8');
  if (s.includes('__VERSION__')) writeFileSync(f, s.replaceAll('__VERSION__', version));
}
writeFileSync('_site/version.json', JSON.stringify({ version, commit: process.env.GITHUB_SHA || 'local', built: new Date().toISOString() }, null, 2) + '\n');
writeFileSync('_site/.nojekyll', '');
console.log(`built _site/ (${version})`);
