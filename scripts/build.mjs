// Build: copy src/ to _site/, stamp the version, write version.json.
// SITE_VERSION is set by CI only (v0.1.N); a local build says "dev".
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const version = process.env.SITE_VERSION || 'dev';
rmSync('_site', { recursive: true, force: true });
cpSync('src', '_site', { recursive: true });
// The sites bar's registry (Dinis, 18 Nov 2026, Website repo board/guidance/2026-11-18-the-sites-bar.md): read
// promptugal.news/api/v1/sites.json at build; keep it in data/sites-registry.json only if the vendored renderer accepts it,
// so a build with the registry down (or refused) keeps the last good one. Data, not code: nothing from it is run.
{
  const { pinProblems } = await import('./sites-bar-pin.mjs');
  const bad = pinProblems(); if (bad.length) { console.error(`sites bar 1.1.0: not the pinned files: ${bad.join(', ')} (never patch the vendored bar)`); process.exit(1); }
  const { check } = await import('../vendor/sites-bar/1.1.0/sites-bar-render.mjs');
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10000);   // covers the headers and the whole body
  try {
    const r = await fetch('https://promptugal.news/api/v1/sites.json', { signal: ac.signal, redirect: 'error', headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('status ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 256 * 1024) throw new Error('too large');
    const reg = JSON.parse(buf.toString('utf8'));
    if (!check(reg)) throw new Error('refused by the renderer');
    // a tripwire: the vendored files must match the sha256s the registry lists for 1.1.0 (the blob-id pin above is the control)
    if (reg.bar && reg.bar.version === '1.1.0' && reg.bar.sha256) {
      const { createHash } = await import('node:crypto');
      for (const [k, f] of [['render', 'vendor/sites-bar/1.1.0/sites-bar-render.mjs'], ['css', 'src/assets/sites-bar/1.1.0/sites-bar.css'], ['js', 'src/assets/sites-bar/1.1.0/sites-bar.js']])
        if (createHash('sha256').update(readFileSync(f)).digest('hex') !== reg.bar.sha256[k]) { console.error(`sites bar: ${f} does not match the registry's sha256 for 1.1.0`); process.exit(1); }
      console.log("sites bar 1.1.0: the three files match the registry's sha256s");
    }
    // keep only what the renderer reads (the sites), with where and when it was read
    const ver = typeof reg.version === 'string' ? reg.version.slice(0, 40).replace(/[^\w.-]/g, '') : null;
    writeFileSync('data/sites-registry.json', JSON.stringify({ read_at: new Date().toISOString(), from: 'https://promptugal.news/api/v1/sites.json', registry_version: ver, license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', by: 'PrompTugal.news' }, registry: { sites: reg.sites } }, null, 1) + '\n');
    console.log(`sites registry: ${reg.sites.length} sites, ${ver || 'no version'}`);
  } catch (e) { console.warn(`WARNING sites registry: kept the last good copy in data/sites-registry.json (${e.message})`); }
  finally { clearTimeout(t); }
}
// the shared time-zone-to-country table (dev@'s tz-country.json 1.0.0, pinned in scripts/sites-bar-pin.mjs): checked against
// the registry's obs_tz.integrity when the registry was read, then written into assets/obs/obs.js, so the page asks no one.
{
  const raw = readFileSync('vendor/obs/tz-country/1.0.0/tz-country.json');
  try {
    const reg = await (await fetch('https://promptugal.news/api/v1/sites.json', { redirect: 'error' })).json();
    if (reg.obs_tz && reg.obs_tz.version === '1.0.0') {
      const { createHash } = await import('node:crypto');
      const sri = 'sha256-' + createHash('sha256').update(raw).digest('base64');
      if (sri !== reg.obs_tz.integrity) { console.error("tz-country.json 1.0.0 does not match the registry's obs_tz.integrity"); process.exit(1); }
      console.log("tz-country 1.0.0: matches the registry's integrity");
    }
  } catch (e) { console.warn(`WARNING tz-country: registry not read (${e.message}); the git pin still holds`); }
  const zones = JSON.parse(raw.toString('utf8')).zones;
  const clean = {}; for (const [k, v] of Object.entries(zones || {})) if (typeof k === 'string' && /^[A-Za-z0-9_+\/-]{1,64}$/.test(k) && typeof v === 'string' && /^[A-Z]{2}$/.test(v)) clean[k] = v;
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
