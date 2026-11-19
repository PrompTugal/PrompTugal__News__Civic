// The Content-Security-Policy of every page (civic.b@PrompTugal.dinis, 18 Nov 2026), set as a <meta http-equiv> because
// GitHub Pages sets no custom headers. Pre-reviewed by civic.b.security@ (Sonnet) the same day. One copy: generate.mjs writes
// it into every page head and validate.mjs fails a page without exactly this policy.
//   script-src 'self': no inline script, no eval; the two scripts (obs.js, live/contracts.js) are same origin.
//   style-src 'unsafe-inline': a known trade (inline width bars, obs.js's notice button); CSS cannot run code with scripts locked.
//   connect-src: data.promptugal.news (live contracts), dev.send.sgraph.ai (obs append) and the sister sites (below).
//     No location-lookup host: since 19 Nov 2026 obs.js takes the country from the browser's time zone (Dinis: no IP base).
//   The sister sites' exact hosts in img-src and connect-src (no wildcard): the sites bar 1.1.0 shows each site's /preview.svg
//     as an <img> and reads its /version.json; the list comes from the registry snapshot data/sites-registry.json, each
//     host already checked by the vendored renderer (https, promptugal.news or a subdomain, no port).
//   Limits of a meta policy: frame-ancestors, report-uri and sandbox are ignored, so there is no clickjacking protection here.
import { readFileSync } from 'node:fs';
const SISTERS = (() => { try {
  return [...new Set(JSON.parse(readFileSync(new URL('../data/sites-registry.json', import.meta.url), 'utf8')).registry.sites
    .map(x => new URL(x.url)).filter(u => u.protocol === 'https:' && !u.port && /^([a-z0-9-]+\.)*promptugal\.news$/.test(u.hostname)).map(u => 'https://' + u.hostname))].sort();
} catch { return []; } })();
const HOSTS = [...new Set(['https://promptugal.news', 'https://data.promptugal.news', ...SISTERS])];
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  ["img-src 'self'", ...SISTERS].join(' '),
  "font-src 'self'",
  ["connect-src 'self'", ...HOSTS, 'https://dev.send.sgraph.ai'].join(' '),
  "frame-src 'self'",
  "worker-src 'none'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');
export const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
