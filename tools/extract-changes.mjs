// What happened to the councils' contracts after they were signed: IMPIC's open data of contract modifications
// (modificações contratuais), joined to the Algarve councils' contracts of 2025 and 2026 in data/procurement/base-<year>.json.
// civic.b@PrompTugal.dinis, 19 Nov 2026.
// A signed contract states a price and a term; a change (a later agreement or administrative act, on a legal basis in the
// Código dos Contratos Públicos) can raise or lower the price or extend the term. Each contract's price at signing is a
// forecast of what it will cost; the price after its last change is the outcome so far.
// Sources (dados.gov.pt, licence other-pd as published):
//   changes:   "Contratos Públicos - Portal Base - IMPIC - Modificações Contratuais de 2012 a 2026" (dataset 668d65dbcb1b953e80198435)
//   contracts: "Contratos Públicos - Portal Base - IMPIC - Contratos de 2012 a 2026" (dataset 66d72d488ca4b7cb2de28712), for each
//              contract's original term (prazoExecucao), which data/procurement/base-<year>.json does not keep
// Usage: node --max-old-space-size=10000 tools/extract-changes.mjs <modcontratsYYYY.json,...> <ContratosYYYY.json,...> <out.json> \
//          <changes resource urls,...> <read-on YYYY-MM-DD>
// Node built-ins only. Keeps facts only: which contract, when, on what legal basis, the price and term after the change.
// No contract text is copied (the page takes each contract's description from base-<year>.json, withheld as it is there).
import { readFileSync, writeFileSync } from 'node:fs';
import { objects } from './json-stream.mjs';
const [modsIn, contractsIn, out, modsRes, readOn] = process.argv.slice(2);
if (!readOn || !/^\d{4}-\d{2}-\d{2}$/.test(readOn)) { console.error('usage: see the header'); process.exit(2); }
const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\u2014/g, '-').replace(/[<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
const money = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e10 ? Math.round(v * 100) / 100 : null);
const days = v => { const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,5}$/.test(v.trim()) ? Number(v) : NaN); return Number.isInteger(n) && n >= 0 && n < 36500 ? n : null; };
// IMPIC writes these dates as DD/MM/YYYY hh:mm:ss
const day = v => { const m = typeof v === 'string' && /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim()); if (!m || +m[3] < 2012 || +m[3] > 2027) return null;
  const d = `${m[3]}-${m[2]}-${m[1]}`; return new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d ? d : null; };
// The councils' contracts, by id (a Map: a crafted id can never touch an object's prototype)
const base = new Map();
for (const y of [2025, 2026]) for (const c of JSON.parse(readFileSync(`data/procurement/base-${y}.json`, 'utf8')).contracts) {
  const id = String(c.id); if (/^\d{1,12}$/.test(id)) base.set(id, c);
}
// 1. The changes to those contracts
const changes = new Map(); let seen = 0, dropped = 0;
for (const f of modsIn.split(',')) for (const m of objects(f)) {
  seen++;
  const id = String(m.idcontrato ?? '').trim(); if (!base.has(id)) continue;
  const date = day(m.modifContratoData), price = money(m.modifContratoPrecoAlterado);
  if (!date || price == null) { dropped++; continue; }
  if (!changes.has(id)) changes.set(id, []);
  changes.get(id).push({ date, published: day(m.modifDataPublicacao), basis: clean(m.modifContratoFundamento), act: clean(m.modifContratoTipoAto).slice(0, 40),
    price_after: price, term_days_after: days(m.modifPrazoExecucao) });
}
// 2. Each changed contract's original term, from IMPIC's raw contracts (streamed: the yearly files pass 600 MB)
const term = new Map();
for (const f of contractsIn.split(',')) for (const r of objects(f)) { const id = String(r.idcontrato ?? ''); if (changes.has(id) && !term.has(id)) term.set(id, days(r.prazoExecucao)); }
const rows = [];
for (const [id, list] of changes) {
  const c = base.get(id);
  // the same change can be listed twice; keep one of each (date, price, term, basis), oldest first
  const uniq = [...new Map(list.map(x => [`${x.date}|${x.price_after}|${x.term_days_after}|${x.basis}`, x])).values()].sort((a, b) => a.date.localeCompare(b.date) || (a.published || '').localeCompare(b.published || ''));
  const last = uniq[uniq.length - 1];
  // IMPIC gives no change number: when the last two changes share a date and a publication date but not a price, which came
  // last is unknown, and the contract is flagged and left out of the totals (Sonnet post-review)
  const prev = uniq[uniq.length - 2], tie = !!prev && prev.date === last.date && prev.published === last.published && prev.price_after !== last.price_after;
  rows.push({ id, council: c.council, published: c.published || null, signed: c.signed || null, procedure: clean(c.procedure).slice(0, 80),
    price: money(c.price), base_price: money(c.base_price), term_days: term.has(id) ? term.get(id) : null,
    changes: uniq, order_uncertain: tie, price_last: last.price_after, term_days_last: [...uniq].reverse().find(x => x.term_days_after != null)?.term_days_after ?? null,
    url: `https://www.base.gov.pt/Base4/pt/detalhe/?type=contratos&id=${id}` });
}
rows.sort((a, b) => (b.changes[b.changes.length - 1].date).localeCompare(a.changes[a.changes.length - 1].date) || a.id.localeCompare(b.id));
writeFileSync(out, JSON.stringify({
  source: { title: 'Contratos Públicos - Portal Base - IMPIC: Modificações Contratuais, joined to the councils\' contracts (open data on dados.gov.pt)',
    changes_dataset: 'https://dados.gov.pt/pt/datasets/668d65dbcb1b953e80198435/', changes_resource: modsRes.split(','),
    contracts_dataset: 'https://dados.gov.pt/pt/datasets/66d72d488ca4b7cb2de28712/', read_on: readOn, licence: 'other-pd (as published on dados.gov.pt)',
    covers: 'contracts of the 16 Algarve councils published in 2025 and 2026 (data/procurement/base-2025.json and base-2026.json)' },
  license: { name: 'Outra (Domínio Público), as dados.gov.pt publishes it for this dataset', url: 'https://dados.gov.pt/pt/datasets/668d65dbcb1b953e80198435/', id: 'other-pd' },
  count: rows.length, contracts: rows,
}, null, 1) + '\n');
console.log(`${rows.length} council contracts changed, ${rows.reduce((t, r) => t + r.changes.length, 0)} changes (${dropped} rows dropped as malformed) of ${seen} change rows; original term found for ${[...term.values()].filter(x => x != null).length}`);
