// The Content-Security-Policy of every page (civic.b@PrompTugal.dinis, 18 Nov 2026), set as a <meta http-equiv> because
// GitHub Pages sets no custom headers. Pre-reviewed by civic.b.security@ (Sonnet) the same day. One copy: generate.mjs writes
// it into every page head and validate.mjs fails a page without exactly this policy.
//   script-src 'self': no inline script, no eval; the three scripts are same origin (meter.js imports its vendored core).
//   style-src 'unsafe-inline': a known trade (inline width bars, obs.js's notice button); CSS cannot run code with scripts locked.
//   connect-src: data.promptugal.news (live contracts), promptugal.news (obs config_from), dev.send.sgraph.ai (obs append),
//     ipapi.co and ipwho.is (the obs geo list as promptugal.news's obs.json gives it, read 18 Nov 2026). A new host there
//     fails closed: obs.js records no place, and the page works.
//   Limits of a meta policy: frame-ancestors, report-uri and sandbox are ignored, so there is no clickjacking protection here.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://data.promptugal.news https://promptugal.news https://dev.send.sgraph.ai https://ipapi.co https://ipwho.is",
  "frame-src 'self'",
  "worker-src 'none'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');
export const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
