// Put a `license` beside every record in the data files we publish under /data/ (Dinis, 18 Nov 2026: "Every single piece of
// data that we get should have a link to the license that it has"). Contracts are IMPIC's open data, licence other-pd as
// dados.gov.pt publishes it; council and service pages carry no published licence, so they link the source with the words
// "the source's terms". Idempotent. Usage: node tools/add-licences.mjs   (civic.b@PrompTugal.dinis, 18 Nov 2026)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const IMPIC = { name: 'Outra (Domínio Público), as dados.gov.pt publishes it for this dataset', url: 'https://dados.gov.pt/pt/datasets/66d72d488ca4b7cb2de28712/', id: 'other-pd' };
const terms = u => { try { return { name: "the source's terms", url: `https://${new URL(u).host}/`, published: false }; } catch { return { name: "the source's terms", url: null, published: false }; } };
const OURS = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
const hostOf = u => { try { return new URL(u).host; } catch { return ''; } };
const lic = u => /(^|\.)(dados|base)\.gov\.pt$/.test(hostOf(u)) ? IMPIC : /(^|\.)promptugal\.news$/.test(hostOf(u)) || /github\.com$/.test(hostOf(u)) && /PrompTugal\//.test(u) ? OURS : terms(u);
const rw = (p, f) => { if (!existsSync(p)) return; const d = JSON.parse(readFileSync(p, 'utf8')); f(d); writeFileSync(p, JSON.stringify(d, null, 1) + '\n'); console.log(`licences: ${p}`); };
for (const p of ['data/procurement/base-2026.json', 'data/procurement/base-2025.json', 'data/procurement/companies-2026.json', 'data/procurement/companies-2025.json'])
  rw(p, d => { d.source.license = IMPIC; for (const c of d.contracts) c.license = IMPIC; });
const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.license && o.license.license) delete o.license.license; for (const [k, v] of Object.entries(o)) if (k !== 'license') walk(v); const u = typeof o.url === 'string' ? o.url : typeof o.source === 'string' ? o.source : null; if (u && /^https?:/.test(u) && (!o.license || o.license.name === "the source's terms")) o.license = lic(u); } };
rw('data/places.json', d => { if (d.source) d.source.license = OURS; });
for (const p of ['data/councils.json', 'data/services.json', 'data/portals.json', 'data/municipal-companies.json', 'data/places.json']) rw(p, walk);
// Our own compilations: the file and each record say so, and name the licences of what they rest on.
rw('data/municipal-companies.json', d => { d.license = OURS; for (const c of d.companies) { c.license = OURS; c.source_licenses = { ownership: { name: "the source's terms", url: 'https://portalautarquico.dgal.gov.pt/', published: false }, nif_and_contracts: IMPIC }; } });
rw('data/portals.json', d => { d.license = OURS; for (const x of d.portals || []) x.license = OURS; });
for (const p of ['data/councils.json', 'data/services.json']) rw(p, d => { d.license = OURS; d.license_note = 'Our compilation is CC BY 4.0; each linked page keeps its own licence, given beside it.'; });
