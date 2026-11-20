// A dated copy of data.b@'s London public-contracts file (Contracts Finder, OGL v3.0) for civic's built page: the page shows
// this copy when the browser cannot load the live file. civic.b@PrompTugal.dinis, 20 Nov 2026.
// Usage: node tools/snapshot-london.mjs <latest.json as read from https://data.promptugal.news/api/v1/contracts-finder/latest.json>
// Keeps the fields the page shows, checked; drops anything else. No supplier or contact is in the source file.
import { readFileSync, writeFileSync } from 'node:fs';
const [inFile] = process.argv.slice(2); if (!inFile) { console.error('usage: see the header'); process.exit(2); }
const d = JSON.parse(readFileSync(inFile, 'utf8'));
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/—/g, '-').replace(/[<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const gbp = v => v && v.currency === 'GBP' && typeof v.amount === 'number' && Number.isFinite(v.amount) && v.amount >= 0 && v.amount < 1e11 ? Math.round(v.amount * 100) / 100 : null;
const NOTICE = /^https:\/\/www\.contractsfinder\.service\.gov\.uk\/Notice\/[0-9a-f-]{36}$/;
const STAGES = new Set(['planning', 'tender', 'award', 'contract', 'implementation']);
if (d.license?.name !== 'Open Government Licence v3.0' || typeof d.license?.attribution !== 'string') { console.error('not the OGL v3.0 file'); process.exit(1); }
if (!TS.test(d.read_at || '')) { console.error('no read time'); process.exit(1); }
const notices = (Array.isArray(d.notices) ? d.notices : []).filter(n => n && NOTICE.test(n.notice) && TS.test(n.published || '')).slice(0, 500).map(n => ({
  notice: n.notice, published: n.published, stage: (Array.isArray(n.stage) ? n.stage : []).filter(s => STAGES.has(s)).slice(0, 3),
  title: clean(n.title, 200), buyer: clean(n.buyer, 120), district: /^[A-Z]{1,2}\d[A-Z\d]?$/.test(n.buyer_postcode_district || '') ? n.buyer_postcode_district : null,
  status: clean(n.status, 20), value_gbp: gbp(n.value), award_gbp: gbp(n.award_value),
  deadline: TS.test(n.deadline || '') ? n.deadline : null, method: clean(n.procurement_method, 30),
}));
writeFileSync('data/london/contracts-finder.json', JSON.stringify({
  source: { title: d.title, file: 'https://data.promptugal.news/api/v1/contracts-finder/latest.json', read_at: d.read_at, window_from: d.provenance?.window_from || null, window_to: d.provenance?.window_to || null,
    publisher: 'Cabinet Office, Contracts Finder (UK government)', page: 'https://www.contractsfinder.service.gov.uk/', about: clean(d.about, 800), by: 'data.b@PrompTugal.dinis, collected by code; copied here by tools/snapshot-london.mjs' },
  license: { name: d.license.name, url: d.license.url, holder: clean(d.license.holder, 120), attribution: clean(d.license.attribution, 200) },
  counts: { london_notices: notices.length, all_notices_in_window: typeof d.counts?.notices_in_window === 'number' ? d.counts.notices_in_window : null },
  notices,
}, null, 1) + '\n');
console.log(`${notices.length} London notices, read ${d.read_at}`);
