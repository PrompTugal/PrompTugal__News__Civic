// Extract the Algarve councils' procurement notices (anúncios) from IMPIC's open data, and join each to the contracts
// that cite it. civic.b@PrompTugal.dinis, 19 Nov 2026.
// A notice is published in the Diário da República when a council opens a procedure; it states the base price (preço base),
// the most the council will pay. The contract comes later. So each notice is a prediction made in public before its outcome.
// Sources (dados.gov.pt, licence other-pd as published):
//   notices:   "Contratos Públicos - Portal Base - IMPIC - Anúncios de 2012 a 2026" (dataset 66d72fbc58cd7a63dae28712)
//   contracts: "Contratos Públicos - Portal Base - IMPIC - Contratos de 2012 a 2026" (dataset 66d72d488ca4b7cb2de28712)
// Usage: node --max-old-space-size=8000 tools/extract-notices.mjs <anuncios files,comma-separated> <Contratos files,comma-separated> \
//          <out pattern with {year}> <notices resource urls,comma-separated> <contracts resource urls,comma-separated> <read-on YYYY-MM-DD>
// e.g. anuncios2025.json,anuncios2026.json Contratos2025.json,Contratos2026.json data/procurement/notices-{year}.json ...
// Several years are read together so that a change notice of 2026 finds the 2025 notice it changes, and a contract of 2026
// finds its 2025 notice. Each procedure is written to the file of the year of its first notice.
// Node built-ins only. Keeps public facts only: which council, what, when, the base price, the deadline, the notice's
// Diário da República link, and the contracts that cite it. Tender-platform links (PecasProcedimento) are not kept.
import { writeFileSync } from 'node:fs';
import { objects } from './json-stream.mjs';
const [noticesIn, contractsIn, out, noticesRes, contractsRes, readOn] = process.argv.slice(2);
if (!readOn || !/^\d{4}-\d{2}-\d{2}$/.test(readOn) || !out.includes('{year}')) { console.error('usage: see the header'); process.exit(2); }
// Each council's NIF as the BASE data itself gives it (the same table as tools/extract-base.mjs).
const NIF = { albufeira: '503539473', alcoutim: '506772446', aljezur: '505932512', 'castro-marim': '506801969', faro: '506579425',
  lagoa: '506804240', lagos: '505170876', loule: '502098139', monchique: '506826961', olhao: '506321894', portimao: '505309939',
  'sao-bras-de-alportel': '503219924', silves: '506818837', tavira: '501067191', 'vila-do-bispo': '506730573', 'vila-real-de-santo-antonio': '506833224' };
const byNif = new Map(Object.entries(NIF).map(([id, n]) => [n, id]));
const NUM = /^\d{1,6}\/20\d{2}$/, DAY = /^(\d{4})-\d{2}-\d{2}/;
const DR = /^https:\/\/files\.diariodarepublica\.pt\/[A-Za-z0-9_\/.-]{1,200}\.pdf$/;
const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\u2014/g, '-').replace(/[<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
const money = v => { const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,10}(\.\d{1,2})?$/.test(v.trim()) ? Number(v) : NaN);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null; };
// a day, YYYY-MM-DD, 2025 to 2027 only, and a real date (a value with a time keeps its day)
const day = v => { const m = typeof v === 'string' && DAY.exec(v.trim()); if (!m || +m[1] < 2025 || +m[1] > 2027) return null;
  const d = v.trim().slice(0, 10); return new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d ? d : null; };
// People only as public and professional (the rule of tools/extract-base.mjs): a NIF masked or marking a natural person.
const isPerson = nif => !/^\d{9}$/.test(nif) || /^(1|2|3|45|8)/.test(nif);
// Free text that may name or reach a private person: a natural person's NIF, a title before a name, an e-mail, a phone number.
const PERSONISH = /(?:^|\D)(?:[123]\d{8}|45\d{7}|8\d{8})(?:\D|$)|\b(?:sr|sra|dr|dra|eng|enga|engº|arq|arqª|prof|profª)\b\.?[ªº]?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]|@|(?:^|\D)(?:\+351\s?)?[29]\d{2}\s?\d{3}\s?\d{3}(?:\D|$)/i;   // a title before a name, in any case (post-review)
const KIND = { 'Anúncio de procedimento': 'procedure', 'Anúncio de concurso urgente': 'urgent', 'Anúncio de Alteração': 'change' };

// 1. The councils' notices (the yearly notices file is small enough to stream the same way).
const notices = new Map();   // notice number -> row; a Map, so a crafted number can never touch an object's prototype
let seenNotices = 0, dropped = 0, repeats = 0;
for (const f of noticesIn.split(',')) for (const a of objects(f)) {
  seenNotices++;
  const council = byNif.get(String(a.nifEntidade || '').trim()); if (!council) continue;
  const n = String(a.nAnuncio || '').trim(); if (notices.has(n)) { repeats++; continue; }   // IMPIC lists some notices more than once: the first is kept
  if (!NUM.test(n) || !day(a.dataPublicacao)) { dropped++; continue; }
  const earlier = (Array.isArray(a.anuncioAnterior) ? a.anuncioAnterior.slice(0, 20) : []).map(x => String(x?.antNAnuncio || '').trim()).filter(x => NUM.test(x));
  notices.set(n, {
    n, council, kind: KIND[a.tipoActo] || 'other', published: day(a.dataPublicacao), deadline: day(a.DataLimitePropostas),
    procedure: clean(a.modeloAnuncio).slice(0, 80), types: (Array.isArray(a.tiposContrato) ? a.tiposContrato : []).map(clean).slice(0, 5),
    what: clean(a.descricaoAnuncio), nif: String(a.nifEntidade).trim(), base_price: money(a.PrecoBase), base_stated: a.PrecoBase !== 'Inexistente',
    dr: DR.test(String(a.url || '')) ? a.url : null, earlier,
  });
}
// 2. The contracts that cite one of these notices (streamed: the contracts file passes 600 MB).
const cited = new Map(), seenIds = new Set(); let seenContracts = 0;
for (const f of contractsIn.split(',')) for (const r of objects(f)) {
  seenContracts++;
  const n = String(r.nAnuncio || '').trim(); if (!notices.has(n)) continue;
  const id = String(r.idcontrato || ''); if (!/^\d{1,12}$/.test(id) || seenIds.has(id)) continue;
  if (!(r.adjudicante || []).some(x => String(x.nifEntContrato || '').trim() === notices.get(n).nif)) continue;   // the same council as the notice
  seenIds.add(id); if (!cited.has(n)) cited.set(n, []);
  cited.get(n).push({ id, price: money(r.precoContratual), base_price: money(r.precoBaseProcedimento), published: day(r.dataPublicacao),
    signed: day(r.dataCelebracaoContrato), person: (r.adjudicatarios || []).some(x => isPerson(String(x.nifEntContrato || '').trim())), url: `https://www.base.gov.pt/Base4/pt/detalhe/?type=contratos&id=${id}` });
}
// 3. A procedure's chain: a change notice names the notice it changes; follow back to the first one we hold.
const root = n => { let x = n; const seen = new Set(); while (notices.get(x)?.kind === 'change' && notices.get(x).earlier.length && !seen.has(x)) {
  seen.add(x); const e = notices.get(x).earlier[0]; if (!notices.has(e)) return null; x = e; } return notices.get(x)?.kind === 'change' ? null : x; };
const procs = new Map();
for (const v of notices.values()) {
  const r = root(v.n); if (!r) continue;
  if (!procs.has(r)) procs.set(r, { first: notices.get(r), changes: [] });
  if (r !== v.n) procs.get(r).changes.push(v);
}
const rows = [];
for (const { first, changes } of procs.values()) {
  changes.sort((a, b) => (a.published || '').localeCompare(b.published || ''));
  const chain = [first, ...changes], contracts = chain.flatMap(x => cited.get(x.n) || []);
  // the text is withheld when it may name a private person, or when a contract that cites it went to one
  const withhold = chain.some(x => PERSONISH.test(x.what)) || contracts.some(c => c.person);
  const last = [...chain].reverse().find(x => x.base_price != null) || first;
  rows.push({ n: first.n, council: first.council, kind: first.kind, published: first.published, deadline: [...chain].reverse().find(x => x.deadline)?.deadline || null,
    procedure: first.procedure, types: first.types, what: withhold ? null : first.what, base_price: first.base_price, base_stated: first.base_stated, dr: first.dr,
    changes: changes.map(x => ({ n: x.n, published: x.published, base_price: x.base_price, deadline: x.deadline, dr: x.dr })),
    base_price_last: last.base_price, contracts: contracts.map(({ person, ...c }) => c) });
}
rows.sort((a, b) => (b.published || '').localeCompare(a.published || '') || a.n.localeCompare(b.n));
const years = [...new Set(rows.map(r => r.published.slice(0, 4)))].sort();
for (const y of years) {
  const ry = rows.filter(r => r.published.startsWith(y));
  writeFileSync(out.replace('{year}', y), JSON.stringify({
    source: { title: 'Contratos Públicos - Portal Base - IMPIC: Anúncios and Contratos (open data on dados.gov.pt)',
      notices_dataset: 'https://dados.gov.pt/pt/datasets/66d72fbc58cd7a63dae28712/', notices_resource: noticesRes.split(','),
      contracts_dataset: 'https://dados.gov.pt/pt/datasets/66d72d488ca4b7cb2de28712/', contracts_resource: contractsRes.split(','),
      read_on: readOn, licence: 'other-pd (as published on dados.gov.pt)', year: y },
    license: { name: 'Outra (Domínio Público), as dados.gov.pt publishes it for this dataset', url: 'https://dados.gov.pt/pt/datasets/66d72fbc58cd7a63dae28712/', id: 'other-pd' },
    councils: NIF, count: ry.length, procedures: ry,
  }, null, 1) + '\n');
  console.log(`${y}: ${ry.length} procedures, ${ry.filter(r => r.contracts.length).length} with a contract, ${ry.filter(r => r.what === null).length} texts withheld`);
}
console.log(`${rows.length} procedures (${notices.size} council notices of ${seenNotices}; ${dropped} council notices dropped as malformed, ${repeats} repeated rows skipped); ${[...cited.values()].reduce((t, a) => t + a.length, 0)} contracts cite them, of ${seenContracts}`);
