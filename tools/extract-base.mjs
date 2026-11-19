// Extract the Algarve councils' contracts from IMPIC's open data of the Portal BASE.
// Source: dados.gov.pt, dataset "Contratos Públicos - Portal Base - IMPIC - Contratos de 2012 a 2026"
// (https://dados.gov.pt/pt/datasets/66d72d488ca4b7cb2de28712/), licence other-pd as published.
// Usage: node --max-old-space-size=8000 tools/extract-base.mjs <ContratosYYYY.json> <out.json> <resource-url> <read-on> [<buyers.json>]
// With <buyers.json> (data/municipal-companies.json; civic.b@PrompTugal.dinis, 18 Nov 2026) it extracts the contracts of
// those buyers (the councils' municipal companies, by NIF) instead of the councils': each row then also has `buyer` (the NIF)
// and `council` is the owner council.
// Node built-ins only. Keeps public facts only: who bought, from whom, what, how, when, how much.
import { writeFileSync, readFileSync } from 'node:fs';
const [inp, out, resource, readOn, buyersFile] = process.argv.slice(2);
const BUYERS = buyersFile ? new Map(JSON.parse(readFileSync(buyersFile, 'utf8')).companies.filter(c => c.nif).map(c => [c.nif, c])) : null;
const COUNCILS = {
  albufeira: 'Albufeira', alcoutim: 'Alcoutim', aljezur: 'Aljezur', 'castro-marim': 'Castro Marim', faro: 'Faro',
  lagoa: 'Lagoa', lagos: 'Lagos', loule: 'Loulé', monchique: 'Monchique', olhao: 'Olhão', portimao: 'Portimão',
  'sao-bras-de-alportel': 'São Brás de Alportel', silves: 'Silves', tavira: 'Tavira', 'vila-do-bispo': 'Vila do Bispo',
  'vila-real-de-santo-antonio': 'Vila Real de Santo António',
};
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const byName = new Map(Object.entries(COUNCILS).map(([id, n]) => [norm(`Município de ${n}`), id]));
// Each council's NIF as the BASE data itself gives it (first read 2026-11-17); matched by NIF first, then by name.
const NIF = { albufeira: '503539473', alcoutim: '506772446', aljezur: '505932512', 'castro-marim': '506801969', faro: '506579425',
  lagoa: '506804240', lagos: '505170876', loule: '502098139', monchique: '506826961', olhao: '506321894', portimao: '505309939',
  'sao-bras-de-alportel': '503219924', silves: '506818837', tavira: '501067191', 'vila-do-bispo': '506730573', 'vila-real-de-santo-antonio': '506833224' };
const byNif = new Map(Object.entries(NIF).map(([id, n]) => [n, id]));
import { objects } from './json-stream.mjs';
// People only as public and professional: a supplier whose NIF is masked in the open data ("-", which IMPIC
// does for private individuals and some others) or whose NIF marks a natural person (first digit 1, 2 or 3,
// or 45, or 8 for a sole trader) keeps no name and no NIF here. Companies (5), public bodies (6) and others (9) keep theirs.
const isPerson = nif => !/^\d{9}$/.test(nif) || /^(1|2|3|45|8)/.test(nif);
const clean = s => (s || '').replace(/[\u0080-\u009f]/g, '-').replace(/[\u2014]/g, '-').replace(/\s+/g, ' ').trim();
const supplier = s => { const nif = String(s.nifEntContrato || '').trim();
  return isPerson(nif) ? { withheld: true, country: s.codPaisEntContrato || null } : { nif, name: clean(s.descEntContrato), country: s.codPaisEntContrato || null, sme: s.adjudicatarioPME }; };
const rows = objects(inp); let total = 0;
const seenNames = {};
const contracts = [];
for (const r of rows) {
  total++;
  for (const a of r.adjudicante || []) {
    const aNif = String(a.nifEntContrato || '').trim();
    const co = BUYERS ? BUYERS.get(aNif) : null;
    const id = BUYERS ? (co && co.council) : (byNif.get(aNif) || byName.get(norm(a.descEntContrato)));
    if (!id) continue;
    if (BUYERS) seenNames[aNif] = { name: clean(a.descEntContrato), nif: aNif, council: id };
    else seenNames[id] = { name: `Município de ${COUNCILS[id]}`, nif: NIF[id] };
    const sup = (r.adjudicatarios || []).map(supplier);
    const anyPerson = sup.some(x => x.withheld);
    contracts.push({
      id: r.idcontrato, council: id, ...(BUYERS ? { buyer: aNif } : {}),
      object: anyPerson ? null : clean(r.objectoContrato), // free text may name the person: kept out when a supplier is withheld
      type: r.tipoContrato || [], procedure: r.tipoprocedimento || '',
      suppliers: sup,
      price: r.precoContratual, base_price: r.precoBaseProcedimento || null,
      published: r.dataPublicacao, signed: r.dataCelebracaoContrato || null,
      cpv: (r.CPV || []).map(c => ({ id: c.cpvID, desc: clean(c.cpvdescricao) })),
      place: (r.localExecucao || []).map(clean), legal_basis: clean(r.fundamentacao),
      bids: (r.Lotes || []).reduce((n, l) => n + (l.NumPropostas || 0), 0) || null,
      url: `https://www.base.gov.pt/Base4/pt/detalhe/?type=contratos&id=${r.idcontrato}`,
    });
    break;
  }
}
contracts.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
writeFileSync(out, JSON.stringify({
  source: { title: 'Contratos Públicos - Portal Base - IMPIC (open data on dados.gov.pt)', dataset: 'https://dados.gov.pt/pt/datasets/66d72d488ca4b7cb2de28712/', resource, read_on: readOn, licence: 'other-pd (as published on dados.gov.pt)' },
  [BUYERS ? 'buyers' : 'councils']: seenNames, count: contracts.length, contracts,
}, null, 1) + '\n');
console.log(`${contracts.length} contracts from ${Object.keys(seenNames).length} ${BUYERS ? 'buyers' : 'councils'} of ${total} rows`);
