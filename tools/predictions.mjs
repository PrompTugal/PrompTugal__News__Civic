// Append civic's predictions to data/predictions/predictions.jsonl, in the library's form (library.promptugal.news/predictions/form/,
// /api/v1/predictions/form.json, read 19 Nov 2026). civic.b@PrompTugal.dinis, 19 Nov 2026.
// The predictions are the councils' own: each contract's estimated price (preço base), recorded before the procedure, and the
// contracted price, recorded when it was signed. One prediction line and one outcome line per contract with an estimate.
// Append only: a contract already in the file is never written again, a line is never edited or removed. A correction would
// be a new line naming the one it corrects (`corrects`). No private individual is named; no contract text is copied.
// Run:  node tools/predictions.mjs   (after tools/extract-base.mjs refreshes data/procurement/base-<year>.json)
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
const SITE = 'civic.promptugal.news', PAGE = `https://${SITE}/money/estimates/`, FILE = 'data/predictions/predictions.jsonl';
const LIC = { name: 'Outra (Domínio Público), as dados.gov.pt publishes it for this dataset', url: 'https://dados.gov.pt/pt/datasets/66d72d488ca4b7cb2de28712/' };
const now = new Date().toISOString().slice(0, 16) + 'Z';
const names = Object.fromEntries((JSON.parse(readFileSync('data/places.json', 'utf8')).places || []).map(p => [p.id, p.name]));
const eur = n => `${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
mkdirSync('data/predictions', { recursive: true });
const seen = new Set();
if (existsSync(FILE)) for (const l of readFileSync(FILE, 'utf8').split('\n')) if (l.trim()) { const o = JSON.parse(l); if (o.type === 'prediction') seen.add(o.id); }
const out = [];
for (const y of [2025, 2026]) {
  const d = JSON.parse(readFileSync(`data/procurement/base-${y}.json`, 'utf8'));
  for (const c of d.contracts) {
    if (typeof c.base_price !== 'number' || !(c.base_price > 0) || typeof c.price !== 'number') continue;   // no estimate: nothing was predicted
    if (!/^\d{1,12}$/.test(String(c.id)) || !/^\d{4}-\d{2}-\d{2}$/.test(c.published || '') || !/^https:\/\/www\.base\.gov\.pt\//.test(c.url || '')) continue;
    const id = `estimate-base-${c.id}`; if (seen.has(id)) continue; seen.add(id);
    const who = `Câmara Municipal de ${names[c.council] || c.council}`.slice(0, 80);
    out.push({ type: 'prediction', id, site: SITE, page: PAGE, shown_at: now, said_by: who, source: c.url, licence: LIC, kind: 'statement',
      subject: `${who}: contract BASE ${c.id}, base price`.slice(0, 120), due: c.published,
      said: `Base price (preço base) ${eur(c.base_price)}, as recorded on the Portal BASE`.slice(0, 300),
      value: { quantity: 'base_price', unit: 'EUR', value: c.base_price } });
    const diff = c.price - c.base_price, exact = Math.abs(diff) < 0.5;
    // when the council grants a right and is paid (a concession, the use or running of public property), the base price is a floor
    const paid = /cess[aã]o|direito (?:de |do )?(?:uso|explora)|concess[aã]o/i.test(c.object || ''), above = c.price > c.base_price + 0.5;
    out.push({ type: 'outcome', of: id, checked_at: now, result: !above || paid ? 'held' : 'missed',
      happened: (`Contracted price ${eur(c.price)}, published on the Portal BASE on ${c.published}` + (above && paid ? '. The council grants a right here and is paid, so the base price is a floor and a price above it is expected' : '')).slice(0, 400),
      value: { quantity: 'contract_price', unit: 'EUR', value: c.price },
      difference: exact ? 'exact' : `${diff > 0 ? '+' : '-'}${eur(Math.abs(Math.round(diff * 100) / 100))} (${diff > 0 ? '+' : ''}${(diff / c.base_price * 100).toFixed(1)}%)`,
      evidence: [c.url] });
  }
}
if (out.length) appendFileSync(FILE, out.map(o => JSON.stringify(o)).join('\n') + '\n');
const lines = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).length;
console.log(`predictions: ${out.length / 2} new pairs appended; ${lines} lines in ${FILE}`);
