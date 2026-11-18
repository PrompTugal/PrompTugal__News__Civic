// Generate the site's pages from data/ into _site/: every page as index.html and its markdown twin index.md,
// plus llms.txt and sitemap.xml. Node built-ins only. Called by scripts/build.mjs after src/ is copied.
// Written by civic@PrompTugal.dinis, 17 November 2026.
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { CSP_META } from './csp.mjs';
import { join, dirname } from 'node:path';

const SITE = 'https://civic.promptugal.news';
const OUT = '_site';
const read = (p, fallback = null) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;

// ---------------------------------------------------------------- data
const base = { 2026: read('data/procurement/base-2026.json'), 2025: read('data/procurement/base-2025.json') };
const places = read('data/places.json', { places: [] });
const councilsData = read('data/councils.json', { councils: [] });
const services = read('data/services.json', { guides: [], offices: [] });
const portals = read('data/portals.json', { portals: [] });
const glossary = read('data/glossary.json', { terms: [] });
// The councils' municipal companies (civic.b@, 18 Nov 2026): they buy under their own NIF, outside the councils' totals.
const munis = read('data/municipal-companies.json', { companies: [] });
const security = read('data/security/findings.json', { findings: [], threat_models: [] });
const coBase = { 2026: read('data/procurement/companies-2026.json', { contracts: [] }), 2025: read('data/procurement/companies-2025.json', { contracts: [] }) };

const COUNCIL_IDS = places.places.map(p => p.id);
const placeOf = id => places.places.find(p => p.id === id);
const councilOf = id => (councilsData.councils || []).find(c => c.id === id) || { id };

// ---------------------------------------------------------------- licences (Dinis, 18 Nov 2026, ~14:25 UTC: "Every single piece of data
// that we get should have a link to the license that it has"; PrompTugal__News__Website board/guidance/2026-11-18-licences-and-submissions.md).
// Ours is CC BY 4.0. Taken data keeps its source's published licence; where none is published, a link to the source with the words
// "the source's terms": never blank, never assumed open.
const OURS = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
const IMPIC_LICENCE = { name: 'Outra (Domínio Público), as dados.gov.pt publishes it for this dataset', url: 'https://dados.gov.pt/pt/datasets/66d72d488ca4b7cb2de28712/', id: 'other-pd' };
function licenceOf(url) {
  let host = ''; try { host = new URL(url).host; } catch { return { name: "the source's terms", url: null, published: false }; }
  if (/(^|\.)dados\.gov\.pt$/.test(host) || /(^|\.)base\.gov\.pt$/.test(host)) return IMPIC_LICENCE;
  if (host === 'civic.promptugal.news' || host === 'promptugal.news') return OURS;
  return { name: "the source's terms", url: `https://${host}/`, published: false };
}
const licLink = l => l.url ? `[${l.name}](${l.url})` : l.name;

// ---------------------------------------------------------------- formatting
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = n => n == null ? 'n/a' : `${Math.round(n).toLocaleString('en-GB')} €`;
const meur = n => n >= 1e6 ? `${(n / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 })} million €` : eur(n);
const pct = x => `${Math.round(x * 100)}%`;
const int = n => n.toLocaleString('en-GB');
const day = s => { if (!s) return 'n/a'; const d = new Date(s + 'T12:00:00Z'); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const nodash = s => String(s ?? '').replace(/—/g, ',');

// Inline: [text](url) and **bold**. HTML escapes first; markdown passes through.
const inlineHtml = s => esc(nodash(s))
  // A link only for http(s), site-relative or in-page targets: text from data (IMPIC's free-text contract objects, council
  // pages) could carry [x](javascript:...) (AppSec, civic.b@, 18 Nov 2026, after events.b@'s finding). Anything else stays text.
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^(https?:\/\/|\/(?!\/)|#)/i.test(u.replace(/&amp;/g, '&')) ? `<a href="${u}">${t}</a>` : m)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const inlineMd = s => nodash(s);
const cellMd = s => inlineMd(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// Blocks render to both HTML and markdown.
function render(blocks) {
  let html = '', md = '';
  for (const b of blocks) {
    const [k, a, c, d] = b;
    if (k === 'h2') { html += `<h2 id="${slug(a)}">${inlineHtml(a)}</h2>\n`; md += `\n## ${inlineMd(a)}\n\n`; }
    else if (k === 'h3') { html += `<h3>${inlineHtml(a)}</h3>\n`; md += `\n### ${inlineMd(a)}\n\n`; }
    else if (k === 'p') { html += `<p>${inlineHtml(a)}</p>\n`; md += `${inlineMd(a)}\n\n`; }
    else if (k === 'lede') { html += `<p class="lede">${inlineHtml(a)}</p>\n`; md += `${inlineMd(a)}\n\n`; }
    else if (k === 'small') { html += `<p class="small muted">${inlineHtml(a)}</p>\n`; md += `_${inlineMd(a)}_\n\n`; }
    else if (k === 'src') { html += `<p class="src">${inlineHtml(a)}</p>\n`; md += `Source: ${inlineMd(a)}\n\n`; }
    else if (k === 'note') { html += `<div class="note${c ? ' warn' : ''}"><p>${inlineHtml(a)}</p></div>\n`; md += `> ${inlineMd(a)}\n\n`; }
    else if (k === 'ul') { html += `<ul${c ? ` class="${c}"` : ''}>${a.map(x => `<li>${inlineHtml(x)}</li>`).join('')}</ul>\n`; md += a.map(x => `- ${inlineMd(x)}`).join('\n') + '\n\n'; }
    else if (k === 'ol') { html += `<ol class="steps">${a.map(x => `<li>${inlineHtml(x)}</li>`).join('')}</ol>\n`; md += a.map((x, i) => `${i + 1}. ${inlineMd(x)}`).join('\n') + '\n\n'; }
    else if (k === 'table') {
      const right = new Set((c && c.right) || []);
      html += `<div class="tbl"><table><thead><tr>${a.map((h, i) => `<th${right.has(i) ? ' class="r"' : ''}>${inlineHtml(h)}</th>`).join('')}</tr></thead><tbody>`
        + c0(c).map(r => `<tr>${r.map((x, i) => `<td${right.has(i) ? ' class="r num"' : ''}>${typeof x === 'object' && x && x.html ? x.html : inlineHtml(x)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>\n';
      md += `| ${a.map(cellMd).join(' | ')} |\n|${a.map((_, i) => right.has(i) ? '---:' : '---').join('|')}|\n` + c0(c).map(r => `| ${r.map(x => cellMd(typeof x === 'object' && x && x.html ? x.md : x)).join(' | ')} |`).join('\n') + '\n\n';
    }
    else if (k === 'cards') {
      html += `<div class="grid">${a.map(x => `<div class="card ${x.cls || ''}">${x.stat ? `<div class="stat">${esc(x.stat)}</div>` : ''}<h3>${x.href ? `<a href="${x.href}">${inlineHtml(x.title)}</a>` : inlineHtml(x.title)}</h3><p>${inlineHtml(x.text)}</p></div>`).join('')}</div>\n`;
      md += a.map(x => `- **${x.href ? `[${inlineMd(x.title)}](${x.href})` : inlineMd(x.title)}**${x.stat ? ` (${x.stat})` : ''}: ${inlineMd(x.text)}`).join('\n') + '\n\n';
    }
    else if (k === 'raw') { html += a + '\n'; md += (c || '') + (c ? '\n\n' : ''); }
    else throw new Error(`unknown block ${k}`);
  }
  return { html, md };
}
function c0(c) { return (c && c.rows) || []; }
const slug = s => nodash(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------- layout
const NAV = [['/', 'Front'], ['/money/', 'Public money'], ['/councils/', 'Councils'], ['/services/', 'Services'], ['/map/', 'Cross-map'], ['/api/', 'API'], ['/about/', 'About']];
const pages = [];
const PROV_DEFAULT = {
  code: '`scripts/generate.mjs` builds this page from the data files in `data/` (no hand-edited numbers).',
  agents: 'civic@PrompTugal.dinis (Opus) wrote the text and the code, and civic.b@PrompTugal.dinis (Opus) carries it on from 18 November 2026; research by civic.research.services@ and civic.research.councils@ (Sonnet), checked by civic@.',
  person: 'Not yet checked by a person.',
};
// The kind of page, for the reading meter (api/v1/billing/meter.json): every page here is reference material, priced at
// the floor (1p read to the end) or free. Pages built on IPMA data would stay free (Dinis, 18 Nov 2026); this site has none.
const SITES = [['Weather', 'https://weather.promptugal.news/'], ['Civic', 'https://civic.promptugal.news/'], ['Startups', 'https://startups.promptugal.news/'], ['Travel', 'https://travel.promptugal.news/'], ['Data', 'https://data.promptugal.news/']];
const pageType = path => path.startsWith('/account/') ? 'account' : /^\/(about|design|api)\//.test(path) ? 'site' : path.startsWith('/services/') ? 'evidence' : 'data';
function page({ path, title, description, kicker, blocks, prov = {}, sources = [] }) {
  const navCur = '/' + (path.split('/')[1] ? path.split('/')[1] + '/' : '');
  const p = { ...PROV_DEFAULT, ...prov };
  const srcBlocks = sources.length ? [['h2', 'Sources'], ['ul', sources.map(s => typeof s === 'string' ? s : `[${s.title}](${s.url})${s.read_on ? `, read ${day(s.read_on)}` : ''}; licence: ${licLink(s.license || licenceOf(s.url))}`)], ['small', `Our text, tables and calculations: ${licLink(OURS)}. Each source keeps its own licence, linked above.`]] : [['small', `Our text, tables and calculations: ${licLink(OURS)}.`]];
  const { html, md } = render([...blocks, ...srcBlocks]);
  const fullTitle = path === '/' ? 'PrompTugal.news Civic: public money and public services, explained' : `${title} · PrompTugal.news Civic`;
  const doc = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
${CSP_META}
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(nodash(description))}">
<link rel="canonical" href="${SITE}${path}">
<link rel="alternate" type="text/markdown" href="${path}index.md">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/civic.css">
<meta property="og:image" content="${SITE}/preview.png">
<meta property="og:title" content="${esc(fullTitle)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/meter/meter.css">
<meta name="page-type" content="${pageType(path)}">
<script defer src="/assets/meter/meter.js"></script>
<script defer src="/assets/obs/obs.js"></script>
</head>
<body>
<header class="mast"><div class="wrap">
<a class="brand" href="/" aria-label="PrompTugal.news Civic, front page"><img class="light" src="/assets/brand/promptugal-wordmark-light.svg" alt="PrompTugal.news" width="184" height="30"><img class="dark" src="/assets/brand/promptugal-wordmark-dark.svg" alt="" width="184" height="30"><span class="sub">Civic</span></a>
<nav class="main" aria-label="Sections">${NAV.map(([h, t]) => `<a href="${h}"${h === navCur ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
<div class="tools" id="nr-tools"><a class="tool meter" id="nr-meter-chip" href="/account/"><span class="meter-label">Pay for what you read</span></a></div>
</div></header>
<nav class="em-net" aria-label="The PrompTugal.news sites"><span>Also from PrompTugal.news</span>${SITES.map(([n, u]) => `<a href="${u}"${n === 'Civic' ? ' aria-current="page"' : ' target="_blank" rel="noopener"'}>${n}</a>`).join('')}</nav>
<div class="strip"><div class="wrap"><span><strong>Independent.</strong> Not a government or official site.</span><span>Every fact links its source and the date we read it.</span><span>Version __VERSION__</span></div></div>
<main><div class="wrap">
${kicker ? `<p class="kicker">${esc(kicker)}</p>\n` : ''}<h1>${inlineHtml(title)}</h1>
<div class="body">
${html}
</div>
<section class="prov" aria-label="How this page was made"><strong>How this page was made</strong>
<dl><dt>Code</dt><dd>${inlineHtml(p.code.replace(/`/g, ''))}</dd><dt>Agents</dt><dd>${inlineHtml(p.agents)}</dd><dt>A person</dt><dd>${inlineHtml(p.person)}</dd></dl>
<p>Markdown twin: <a href="${path}index.md">${path}index.md</a>. Something wrong? The <a href="https://github.com/PrompTugal/PrompTugal__News__Civic">repository</a> holds every source file.</p></section>
</div></main>
<footer><div class="wrap">PrompTugal.news Civic, part of <a href="https://promptugal.news/">PrompTugal.news</a>: Portugal, town by town. Independent: not affiliated with, and not speaking for, any government body, council or public portal. Version <a class="ver" href="/version.json">__VERSION__</a>. Code Apache-2.0, text and data <a href="https://creativecommons.org/licenses/by/4.0/" rel="license">CC BY 4.0</a>; sources keep their own licences, linked on each page. Public data from the sources named on each page. <span class="takedown"><strong>Should we not show something?</strong> If you think a page here should not show your data, <a href="https://github.com/PrompTugal/PrompTugal__News__Civic/issues/new?title=Take-down%20request&amp;labels=take-down">open a public issue</a> naming the page; we take it down while we talk (<a href="/about/#take-down">how</a>). <a href="/security/">Security findings</a>.</span></div></footer>
</body>
</html>
`;
  const twin = `---\ntitle: "${nodash(title).replace(/"/g, "'")}"\nurl: ${SITE}${path}\nsite: PrompTugal.news Civic (independent, not a government site)\nversion: __VERSION__\n---\n\n# ${inlineMd(title)}\n\n${md.trim()}\n\n---\n\nShould we not show something? Open a public issue at https://github.com/PrompTugal/PrompTugal__News__Civic/issues naming the page; we take it down while we talk. Licences: our work CC BY 4.0; sources keep their own.\n\nHow this page was made. Code: ${p.code} Agents: ${p.agents} A person: ${p.person}\n`;
  const dir = join(OUT, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), doc);
  writeFileSync(join(dir, 'index.md'), twin);
  pages.push({ path, title, description });
}

// ---------------------------------------------------------------- procurement analysis
const PROC = {
  'Ajuste Direto Regime Geral': ['Direct award', 'the council invites one supplier'],
  'Ajuste direto simplificado ao abrigo da Lei n.º 30/2021, de 21.05': ['Simplified direct award', 'a direct award under the faster rules of Law 30/2021'],
  'Consulta Prévia': ['Prior consultation', 'the council invites at least three suppliers of its choice'],
  'Consulta Prévia Simplificada': ['Simplified prior consultation', 'a prior consultation under the faster rules of Law 30/2021'],
  'Concurso público': ['Open tender', 'anyone may bid, after a notice in the Diário da República'],
  'Concurso público simplificado': ['Simplified open tender', 'an open tender under the faster rules of Law 30/2021'],
  'Concurso limitado por prévia qualificação': ['Restricted tender', 'bidders must first qualify, then bid'],
  'Ao abrigo de acordo-quadro (art.º 258.º)': ['Under a framework agreement (art. 258)', 'bought from a framework agreement with fixed terms'],
  'Ao abrigo de acordo-quadro (art.º 259.º)': ['Under a framework agreement (art. 259)', 'a mini-competition among a framework agreement\'s suppliers'],
  'Contratação excluída II': ['Excluded contracting', 'a contract outside the code\'s procedures (for example between public bodies)'],
};
const procName = p => (PROC[p] || [p])[0];
const isDirect = p => /^Ajuste/i.test(p);
const isPrior = p => /^Consulta Pr/i.test(p);
function summarise(contracts) {
  const total = contracts.reduce((s, c) => s + (c.price || 0), 0);
  const direct = contracts.filter(c => isDirect(c.procedure));
  const prior = contracts.filter(c => isPrior(c.procedure));
  const open = contracts.filter(c => /^Concurso/i.test(c.procedure));
  const byProc = {};
  for (const c of contracts) { const k = c.procedure; byProc[k] = byProc[k] || { n: 0, v: 0 }; byProc[k].n++; byProc[k].v += c.price || 0; }
  return { n: contracts.length, total, direct: direct.length, directV: direct.reduce((s, c) => s + (c.price || 0), 0), prior: prior.length, open: open.length, openV: open.reduce((s, c) => s + (c.price || 0), 0), byProc };
}
function suppliersOf(contracts) {
  const m = new Map();
  for (const c of contracts) {
    const share = (c.price || 0) / Math.max(1, c.suppliers.length);
    for (const s of c.suppliers) {
      if (s.withheld) continue;
      const x = m.get(s.nif) || { nif: s.nif, name: s.name, n: 0, v: 0, councils: new Set(), contracts: [] };
      x.n++; x.v += share; x.councils.add(c.council); x.contracts.push(c);
      m.set(s.nif, x);
    }
  }
  return [...m.values()];
}
const y26 = base[2026].contracts, y25 = base[2025].contracts;
const by26 = Object.fromEntries(COUNCIL_IDS.map(id => [id, y26.filter(c => c.council === id)]));
const by25 = Object.fromEntries(COUNCIL_IDS.map(id => [id, y25.filter(c => c.council === id)]));
const all26 = summarise(y26), all25 = summarise(y25);
const sup26 = suppliersOf(y26);
const multi = sup26.filter(s => s.councils.size >= 3).sort((a, b) => b.councils.size - a.councils.size || b.v - a.v);
const lastPub = y26.reduce((m, c) => (c.published > m ? c.published : m), '');
const BASE_SRC = { license: IMPIC_LICENCE, title: 'Contratos Públicos, Portal BASE, IMPIC: open data on dados.gov.pt (contracts of 2026 and 2025)', url: base[2026].source.dataset, read_on: base[2026].source.read_on };
const whoName = id => (placeOf(id) || { name: id }).name;
const contractLabel = c => c.object || `(object withheld: a supplier is a private individual) ${c.cpv[0] ? c.cpv[0].desc : ''}`;
// Supplier names are data: square brackets and asterisks would read as markdown links or bold, so they are shown as ( ) and · (CIVIC-2026-004).
const nm = s => String(s ?? '').replace(/\[/g, '(').replace(/\]/g, ')').replace(/\*/g, '·');
const supplierCell = c => c.suppliers.map(s => s.withheld ? 'a private individual (name withheld)' : (companyPages.has(s.nif) ? `[${nm(s.name)}](/map/${s.nif}/)` : nm(s.name))).join('; ');
const companyPages = new Set(multi.map(s => s.nif));
const muniOf = id => munis.companies.filter(c => c.council === id);
const muniContracts = (nif, y) => coBase[y].contracts.filter(c => c.buyer === nif);
const muniRows = list => list.map(m => { const a = summarise(muniContracts(m.nif, 2026)), b = summarise(muniContracts(m.nif, 2025));
  return { m, a, b }; });
const MUNI_SRC = { license: { name: "the source's terms", url: 'https://portalautarquico.dgal.gov.pt/', published: false }, title: 'DGAL, list of local companies (Lista das empresas locais), dated 12 February 2025', url: (munis.sources || [{}])[0].url, read_on: munis.read_on };

// ---------------------------------------------------------------- the front page
function frontBlocks() {
  const top = COUNCIL_IDS.map(id => ({ id, s: summarise(by26[id]) })).sort((a, b) => b.s.total - a.s.total);
  return [
    ['lede', 'Public money, public services and the bureaucracy in between, explained and cross-mapped. We start with the Algarve\'s 16 councils: what they buy, from whom, and how; where their decisions are written down; and how to get the everyday things done (a NIF, a health centre, a Multibanco reference, a residence permit).'],
    ['note', `**Independent.** PrompTugal.news Civic is not a government site and does not speak for any council or public body. It reads public, official sources, links each one and says when we read it. Contracts on this site: ${int(all26.n)} signed by the 16 Algarve councils in IMPIC's 2026 open data (published up to ${day(lastPub)}), read ${day(base[2026].source.read_on)}.`],
    ['cards', [
      { cls: 'money', title: 'Public money', href: '/money/', stat: meur(all26.total), text: `What the Algarve's 16 councils have contracted in 2026 so far, across ${int(all26.n)} contracts. ${pct(all26.direct / all26.n)} were direct awards to a single invited supplier. How to read a contract, the minutes and the Diário da República.` },
      { cls: 'money', title: 'The 16 councils', href: '/councils/', stat: '16', text: 'One page per council: its contracts, its biggest suppliers, where its minutes, agendas and notices are published, and what we could not read.' },
      { cls: 'services', title: 'Public services, step by step', href: '/services/', stat: String(services.guides.length + 1), text: 'Paying by Multibanco reference, getting a NIF, registering with the SNS, AIMA residency, and which office does what. From official pages, each step sourced.' },
      { title: 'The cross-map', href: '/map/', stat: String(multi.length), text: 'Companies that hold contracts with three or more Algarve councils this year: council, contract, company, place, linked both ways.' },
    ]],
    ['h2', 'The Algarve\'s councils, by money contracted in 2026'],
    ['p', 'Contract value as published (precoContratual, without VAT as BASE records it), by the council that signed. Direct award share is the share of the council\'s contracts made by ajuste direto.'],
    ['table', ['Council', 'Contracts', 'Value', 'Direct award', ''], { right: [1, 2, 3], rows: top.map(({ id, s }) => [`[${whoName(id)}](/councils/${id}/)`, int(s.n), meur(s.total), pct(s.direct / s.n), { html: `<span class="bar" style="width:${Math.max(2, Math.round(s.total / top[0].s.total * 120))}px"></span>`, md: '' }]) }],
    ['src', `[IMPIC open data on dados.gov.pt](${BASE_SRC.url}), file contratos2026, read ${day(BASE_SRC.read_on)}. Each contract links its record on base.gov.pt.`],
    ['h2', 'Start here'],
    ['ul', [
      '[How a council spends: the four ways it can buy](/money/#how-a-council-buys)',
      '[Paying a bill with a Multibanco reference](/services/pay-by-multibanco-reference/)',
      '[Which office does what](/services/which-office/)',
      '[What we could not read, and why](/about/#what-we-could-not-read)',
    ]],
  ];
}

// ---------------------------------------------------------------- money
function moneyBlocks() {
  const procRows = Object.entries(all26.byProc).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [procName(k), (PROC[k] || ['', ''])[1], int(v.n), pct(v.n / all26.n), meur(v.v)]);
  const biggest = [...y26].sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 12);
  return [
    ['lede', 'Every council contract in Portugal is meant to be published on the Portal BASE, the public procurement portal run by IMPIC. We read IMPIC\'s open data of those contracts and show the Algarve\'s 16 councils: what they buy, how, from whom.'],
    ['h2', 'The year so far'],
    ['cards', [
      { cls: 'money', title: 'Contracts in 2026', stat: int(all26.n), text: `signed by the 16 councils, published on BASE up to ${day(lastPub)}.` },
      { cls: 'money', title: 'Value', stat: meur(all26.total), text: `as published, against ${meur(all25.total)} across all of 2025 (${int(all25.n)} contracts).` },
      { cls: 'money', title: 'Direct awards', stat: pct(all26.direct / all26.n), text: `of contracts (${pct(all26.directV / all26.total)} of value) went to one invited supplier. ${pct(all26.prior / all26.n)} were prior consultations.` },
      { cls: 'money', title: 'Open tenders', stat: pct(all26.open / all26.n), text: `of contracts, but ${pct(all26.openV / all26.total)} of the value: big works go to open tender.` },
    ]],
    ['src', `[IMPIC open data on dados.gov.pt](${BASE_SRC.url}), files contratos2026 and contratos2025, read ${day(BASE_SRC.read_on)}. Our calculation; the code is tools/extract-base.mjs and scripts/generate.mjs in the repository.`],
    ['h2', 'How a council buys'],
    ['p', 'The Código dos Contratos Públicos (the public contracts code, Decreto-Lei 18/2008, as amended) sets the procedures. Which one a council may use depends mostly on the value and the kind of contract; the value limits are in articles 19 to 21 of the code. The four you will see most:'],
    ['table', ['Procedure', 'What it means', 'Contracts', 'Share', 'Value'], { right: [2, 3, 4], rows: procRows }],
    ['src', `Procedure names as recorded in the BASE data; the plain-English meanings are ours. [The code, consolidated, in the Diário da República](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2008-34455475), read ${day('2026-11-17')}.`],
    ['h2', 'The twelve largest contracts of 2026'],
    ['table', ['Council', 'What', 'Supplier', 'Procedure', 'Value', 'Record'], { right: [4], rows: biggest.map(c => [`[${whoName(c.council)}](/councils/${c.council}/)`, contractLabel(c), supplierCell(c), procName(c.procedure), eur(c.price), `[BASE ${c.id}](${c.url})`]) }],
    ['h2', 'How to read a contract on BASE'],
    ['ul', [
      '**Entidade adjudicante**: the public body that buys (here, the Município).',
      '**Adjudicatário**: the supplier that won. A company shows with its NIF; we withhold the names of private individuals.',
      '**Preço contratual**: the contract price as published, normally without VAT.',
      '**Tipo de procedimento**: how the supplier was chosen (see the table above).',
      '**Fundamentação**: the article of the code the council relied on, for example article 20 for a direct award by value.',
      '**CPV**: the European common procurement vocabulary code that says what was bought.',
      '**Data de publicação / celebração**: when it was published on BASE and when it was signed.',
    ]],
    ['h2', 'Where the decisions are written down'],
    ['p', 'A contract is the end of a chain. Before it, the council\'s executive (the Câmara Municipal) decides in a meeting, minuted in an **ata**; big decisions go to the elected Assembleia Municipal; tenders are announced in the **Diário da República** (2nd series) and the budget is approved each year. Each council page lists where that council publishes its minutes, agendas, notices and budget, as far as we could read them.'],
    ['p', councilsData.diario_da_republica && councilsData.diario_da_republica.how_to ? `**Searching the Diário da República.** ${councilsData.diario_da_republica.how_to}` : '**Searching the Diário da República.** Its site at diariodarepublica.pt is an application that needs JavaScript; search by the issuing entity (Município de ...) in the 2nd series.'],
    ['note', '**What BASE does not show.** Contracts that are not reported, municipal companies (they buy under their own NIF, not the council\'s) and spending outside contracts (salaries, transfers to parishes and associations). We now map the councils\' [municipal companies](/money/municipal-companies/) separately, and [what they buy in tech and AI](/money/tech-and-ai/); transfers and salaries are not in BASE at all.'],
  ];
}

// ---------------------------------------------------------------- councils
const CIVIC_GAP = /(minut|atas?\b|procure|base\.gov|contract|council|câmara|camara|agenda|budget|tender|deliber)/i;
function councilBlocks(id) {
  const pl = placeOf(id), co = councilOf(id), cs = by26[id], s = summarise(cs), s25 = summarise(by25[id]);
  const sups = suppliersOf(cs).sort((a, b) => b.v - a.v).slice(0, 10);
  const recent = cs.slice(0, 15);
  const nif = base[2026].councils[id] ? base[2026].councils[id].nif : null;
  const link = (o, label) => o && o.url ? `[${label}](${o.url})` : 'not found yet';
  const where = [
    ['Official site', co.site ? `[${co.site.replace(/^https?:\/\//, '').replace(/\/$/, '')}](${co.site})` : (pl.council_site ? `[${pl.council_site.replace(/^https?:\/\//, '')}](${pl.council_site})` : 'not found yet')],
    ['Executive meeting minutes (atas)', co.minutes ? `${link(co.minutes, 'listing')}${co.minutes.latest ? `, latest listed ${day(co.minutes.latest)}` : ''}` : 'not found yet'],
    ['Meeting agendas', link(co.agendas, 'listing')],
    ['Municipal assembly', link(co.assembly, 'page')],
    ['Public notices (editais)', link(co.notices, 'listing')],
    ['Budget and accounts', link(co.budget, 'page')],
    ['Procurement page', link(co.procurement, 'page')],
    ['Contracts on BASE (open data)', `${int(s.n)} in 2026, below`],
  ];
  const gaps = [...(co.gaps || []), ...(pl.gaps || []).filter(g => CIVIC_GAP.test(g)).map(g => `${g} (from [PrompTugal.news ${pl.name}](${pl.promptugal_page}))`)];
  return [
    ['lede', `The Câmara Municipal de ${pl.name}: what it has contracted in 2026, from whom and how, and where its decisions are published.${co.mayor && co.mayor.name ? ` Its mayor (Presidente da Câmara), as the council's own site names them: ${co.mayor.name}.` : ''}`],
    ['cards', [
      { cls: 'money', title: 'Contracts in 2026', stat: int(s.n), text: `against ${int(s25.n)} in all of 2025.` },
      { cls: 'money', title: 'Value', stat: meur(s.total), text: `as published (${meur(s25.total)} in 2025).` },
      { cls: 'money', title: 'Direct awards', stat: s.n ? pct(s.direct / s.n) : 'n/a', text: `of contracts; open tenders ${s.n ? pct(s.open / s.n) : 'n/a'}.` },
      { title: 'Its NIF', stat: nif || 'n/a', text: 'as the BASE data records the Município (a public body\'s tax number, used to find its contracts).' },
    ]],
    ['h2', 'Where its decisions are published'],
    ['table', ['What', 'Where'], { rows: where }],
    ['src', co.read_on || councilsData.read_on ? `The council's own website, read ${day(co.read_on || councilsData.read_on)}${co.mayor && co.mayor.source ? `; the mayor's name from [the council's page](${co.mayor.source})` : ''}.` : 'Not yet read.'],
    ['h2', 'Its biggest suppliers in 2026'],
    sups.length ? ['table', ['Supplier', 'NIF', 'Contracts', 'Value', 'Other Algarve councils'], { right: [2, 3], rows: sups.map(x => [companyPages.has(x.nif) ? `[${nm(x.name)}](/map/${x.nif}/)` : nm(x.name), x.nif, int(x.n), meur(x.v), String(x.councils.size - 1 + sup26.find(y => y.nif === x.nif).councils.size - x.councils.size)]) }] : ['p', 'None published yet.'],
    ['small', 'Companies and public bodies only. Contracts with private individuals count in the totals, but we withhold their names. A contract with several suppliers is split equally between them.'],
    ['h2', 'Latest contracts, live'],
    ['raw', `<div id="live-contracts" data-place="${esc(id)}" data-company-pages="${esc([...companyPages].join(' '))}"><p class="live-note small muted">Loading the last 90 days of contracts from data.promptugal.news, PrompTugal.news's data site (your browser asks it directly, so it sees your IP address, as any website does). If this does not load, the table below is our published copy.</p><div class="live-body"></div><noscript><p class="small muted">Without JavaScript only our published table below is shown.</p></noscript></div><script defer src="/assets/live/contracts.js"></script>`, `Live in the web page: the last 90 days of this council's contracts and its municipal companies', from [data.promptugal.news](https://data.promptugal.news/api/v1/base-gov-pt/latest.json) (places.${id}). This markdown copy holds only our published table below.`],
    ['h2', 'Its latest contracts'],
    ['table', ['Published', 'What', 'Supplier', 'Procedure', 'Value'], { right: [4], rows: recent.map(c => [`[${day(c.published)}](${c.url})`, contractLabel(c), supplierCell(c), procName(c.procedure), eur(c.price)]) }],
    ['src', `[IMPIC open data on dados.gov.pt](${BASE_SRC.url}), read ${day(BASE_SRC.read_on)}. The full list for this council: [data/procurement/base-2026.json](/data/procurement/base-2026.json) (filter by council "${id}").`],
    ...(muniOf(id).length ? [
      ['h2', 'Its municipal companies'],
      ['p', `These bodies are owned by the council but buy under their own NIF, so their contracts are not in the council's totals above. Together they signed ${int(muniRows(muniOf(id)).reduce((t, x) => t + x.a.n, 0))} contracts worth ${meur(muniRows(muniOf(id)).reduce((t, x) => t + x.a.total, 0))} in 2026.`],
      ['table', ['Company', 'What it does', 'NIF', 'Contracts 2026', 'Value 2026', 'Value 2025'], { right: [3, 4, 5], rows: muniRows(muniOf(id)).map(({ m, a, b }) => [`[${m.name}](/money/municipal-companies/#${m.id})${m.status.startsWith('no activity') ? ' (DGAL: no activity or in liquidation)' : ''}`, m.what, m.nif || 'not found', int(a.n), meur(a.total), meur(b.total)]) }],
      ['src', `Ownership from [DGAL's list of local companies](${MUNI_SRC.url}), read ${day(munis.read_on)}; contracts from [IMPIC's open data](${BASE_SRC.url}) by the company's NIF. All of them: [Municipal companies](/money/municipal-companies/).`],
    ] : []),
    ['h2', 'What we could not read yet'],
    gaps.length ? ['ul', gaps, 'gaps'] : ['p', 'Nothing recorded yet.'],
    ['p', `More on ${pl.name} (its people, events and news): [PrompTugal.news ${pl.name}](${pl.promptugal_page}).`],
  ];
}

// ---------------------------------------------------------------- services
function serviceBlocks(g) {
  const b = [['lede', g.summary || '']];
  if (g.who_for) b.push(['p', `**Who it is for:** ${g.who_for}`]);
  b.push(['h2', 'Step by step']);
  b.push(['ol', (g.steps || []).map(s => `${s.text}${s.source ? ` [source](${s.source})` : ''}`)]);
  if ((g.costs || []).length) { b.push(['h2', 'What it costs']); b.push(['ul', g.costs.map(s => `${s.text}${s.source ? ` [source](${s.source})` : ''}`)]); }
  if ((g.portuguese_terms || []).length) { b.push(['h2', 'The words you will see']); b.push(['table', ['Portuguese', 'What it means'], { rows: g.portuguese_terms.map(t => [`**${t.pt}**`, t.en]) }]); }
  if ((g.gaps || []).length) { b.push(['h2', 'What the official pages do not say']); b.push(['ul', g.gaps, 'gaps']); }
  b.push(['note', 'This is our summary of official pages, not official advice. Rules change: check the official page before you go, and tell us if we are out of date.', true]);
  return b;
}

// ---------------------------------------------------------------- the reading account
function accountBlocks() {
  return [
    ['lede', 'Pay for what you read: the same reading credit as promptugal.news. Each page you read here is charged for the share of it you read, at most 1p, from a balance kept in this browser. Nothing is blocked, and your balance and reading history never leave this browser.'],
    ['raw', '<div id="nr-account" class="nr-mount"><p class="small muted">Your balance, your reading graph and the pages you have read appear here once this page\'s script runs. Without JavaScript nothing is charged.</p></div>', 'Your balance, your reading graph and your history are drawn in your browser from what it keeps; this markdown twin cannot show them.'],
    ['h2', 'How pages are priced'],
    ['p', 'Every page on this site is reference material: council pages, contracts, company pages and service guides cost 1p read to the end, the site\'s own pages (about, design) 1p, and this account page nothing. Opening a page costs at least a tenth of its price. A usefulness rating re-prices it (not useful is free, excellent is double), and you can decline any charge and say why. Prices are copied from [promptugal.news\'s meter](https://promptugal.news/api/v1/billing/meter.json); this site\'s config is [api/v1/billing/meter.json](/api/v1/billing/meter.json).'],
    ['h2', 'Your balance here and on promptugal.news'],
    ['p', 'The credit is kept in your browser\'s storage for civic.promptugal.news only: a browser keeps each site\'s storage apart, so this balance and the one on promptugal.news are separate. Topping up happens on [promptugal.news](https://promptugal.news/account/top-up.html). Carrying one balance across the PrompTugal.news sites is not built yet.'],
    ['note', 'The meter is newsroom.sgit.ai\'s sg-meter v1.5.0 as promptugal.news runs it, copied unedited apart from one comment and one button. It reads no account and sets no cookie.'],
  ];
}

// ---------------------------------------------------------------- build all pages
export function generate() {
  page({ path: '/account/', kicker: 'Your account', title: 'Pay for what you read', description: 'Your reading credit on PrompTugal.news Civic: the balance, the reading graph and the pages read, kept in this browser only.', blocks: accountBlocks(), prov: { code: 'scripts/generate.mjs writes this page; assets/meter/meter.js (from promptugal.news) draws the balance, graph and history in your browser.' } });
  page({ path: '/', title: 'Public money and public services, explained', description: 'Independent: public procurement, council decisions and public services in Portugal, explained and cross-mapped, starting with the Algarve\'s 16 councils. Not a government site.', blocks: frontBlocks(), sources: [BASE_SRC] });

  page({ path: '/money/', kicker: 'Public money', title: 'What the Algarve\'s councils buy, and how', description: `Public procurement by the Algarve's 16 councils in 2026, from IMPIC's open data of the Portal BASE: ${int(all26.n)} contracts, procedures explained.`, blocks: moneyBlocks(), sources: [BASE_SRC, { title: 'Código dos Contratos Públicos, consolidated (Diário da República)', url: 'https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2008-34455475', read_on: '2026-11-17' }] });

  const rows = COUNCIL_IDS.map(id => { const s = summarise(by26[id]); const co = councilOf(id); return [`[${whoName(id)}](/councils/${id}/)`, int(s.n), meur(s.total), pct(s.direct / s.n), co.minutes && co.minutes.url ? `[yes](${co.minutes.url})` : 'not found yet']; });
  page({ path: '/councils/', kicker: 'Councils', title: 'The Algarve\'s 16 councils', description: 'One page per Algarve council: its 2026 contracts, biggest suppliers, and where its minutes, agendas, notices and budget are published.', blocks: [
    ['lede', 'Each council (Câmara Municipal) is run by an executive, elected every four years with the municipal assembly. It decides in minuted meetings and buys through public contracts. Pick a council.'],
    ['table', ['Council', 'Contracts 2026', 'Value', 'Direct award', 'Minutes online'], { right: [1, 2, 3], rows }],
    ['src', `Contracts: [IMPIC open data](${BASE_SRC.url}), read ${day(BASE_SRC.read_on)}. Minutes: each council's own site${councilsData.read_on ? `, read ${day(councilsData.read_on)}` : ''}.`],
    ...(councilsData.amal ? [['h2', 'AMAL, the councils together'], ['p', `${councilsData.amal.what} [amal.pt](${councilsData.amal.url})`]] : []),
  ], sources: [BASE_SRC] });
  for (const id of COUNCIL_IDS) page({ path: `/councils/${id}/`, kicker: 'Council', title: `${whoName(id)}`, description: `The Câmara Municipal de ${whoName(id)}: contracts in 2026, suppliers, and where its minutes, agendas and notices are published. Independent.`, blocks: councilBlocks(id), sources: [BASE_SRC, ...(councilOf(id).site ? [{ title: `The Câmara Municipal de ${whoName(id)}'s own website (minutes, agendas, notices, budget, mayor)`, url: councilOf(id).site, read_on: councilOf(id).read_on || councilsData.read_on }] : [])] });

  page({ path: '/services/', kicker: 'Public services', title: 'How public services work, step by step', description: 'Paying by Multibanco reference, getting a NIF, the SNS, AIMA residency and which office does what in Portugal: step by step, from official pages.', blocks: [
    ['lede', 'The everyday bureaucracy that matters and few explain: each guide is our summary of official pages (gov.pt, ePortugal, the Portal das Finanças, the SNS, AIMA), each step with its source and the date we read it.'],
    ['cards', [...services.guides.map(g => ({ cls: 'services', title: g.title, href: `/services/${g.id}/`, text: g.summary || '' })), { cls: 'services', title: 'Which office does what', href: '/services/which-office/', text: 'Loja do Cidadão, Espaço Cidadão, Finanças, Segurança Social, Junta de Freguesia, Câmara, AIMA, the Conservatória: one line each.' }]],
    ['p', 'Why this matters: [The payment desk that could not take payment](https://promptugal.news/articles/the-payment-desk-that-could-not-take-payment.html), PrompTugal.news, 17 November 2026.'],
  ] });
  for (const g of services.guides) page({ path: `/services/${g.id}/`, kicker: 'Public services', title: g.title, description: nodash(g.summary || g.title).slice(0, 300), blocks: serviceBlocks(g), sources: g.official_pages || [], prov: { code: 'scripts/generate.mjs renders this guide from data/services.json.' } });
  page({ path: '/services/which-office/', kicker: 'Public services', title: 'Which office does what', description: 'Loja do Cidadão, Espaço Cidadão, Finanças, Segurança Social, Junta de Freguesia, Câmara Municipal, AIMA and the Conservatória: what each does, from official pages.', blocks: [
    ['lede', 'Portugal\'s public services are spread over national agencies, councils and parishes, with shared front desks (the Lojas and Espaços Cidadão) that host several of them. Who does what:'],
    ['table', ['Office', 'What it does', 'Official page'], { rows: (services.offices || []).map(o => [`**${o.name}**`, o.what, o.url ? `[page](${o.url})` : 'n/a']) }],
    ['note', 'Our summary of official pages, not official advice.', true],
  ], sources: (services.offices || []).filter(o => o.url).map(o => ({ title: o.name, url: o.url, read_on: o.read_on })) });

  // the cross-map
  page({ path: '/map/', kicker: 'Cross-map', title: 'Council, contract, company, place', description: `Companies holding contracts with three or more Algarve councils in 2026 (${multi.length}), from IMPIC's open data: the links between councils, contracts and companies.`, blocks: [
    ['lede', 'Which companies work for several Algarve councils at once? From the 2026 contracts, every company (by NIF) with contracts at three or more of the 16 councils. Each links to its contracts, and each council page links back.'],
    ['table', ['Company', 'NIF', 'Councils', 'Contracts', 'Value', 'Which'], { right: [2, 3, 4], rows: multi.map(x => [`[${x.name}](/map/${x.nif}/)`, x.nif, String(x.councils.size), int(x.n), meur(x.v), [...x.councils].map(whoName).join(', ')]) }],
    ['src', `[IMPIC open data on dados.gov.pt](${BASE_SRC.url}), read ${day(BASE_SRC.read_on)}. Our calculation. A link is a fact about contracts, not a judgement about anyone.`],
    ['h2', 'What comes next on the map'],
    ['ul', ['Suppliers of the councils\' [municipal companies](/money/municipal-companies/) on the cross-map too.', 'Companies by place: where each supplier is registered against where the work is done.', 'Each contract back to the council meeting that decided it (the minutes) and the notice in the Diário da República.', 'Earlier years (IMPIC publishes from 2012).']],
  ], sources: [BASE_SRC] });
  for (const x of multi) {
    const cs = [...x.contracts].sort((a, b) => (b.published || '').localeCompare(a.published || ''));
    page({ path: `/map/${x.nif}/`, kicker: 'Company', title: nm(x.name), description: `${nm(x.name)} (NIF ${x.nif}): contracts with ${x.councils.size} Algarve councils in 2026, from IMPIC's open data.`, blocks: [
      ['lede', `${nm(x.name)} (NIF ${x.nif}) holds ${int(x.n)} contracts with ${x.councils.size} of the Algarve's 16 councils in IMPIC's 2026 data, worth ${meur(x.v)} as published.`],
      ['table', ['Council', 'Contracts', 'Value'], { right: [1, 2], rows: [...x.councils].map(id => { const c2 = cs.filter(c => c.council === id); return [`[${whoName(id)}](/councils/${id}/)`, int(c2.length), meur(c2.reduce((s, c) => s + (c.price || 0) / Math.max(1, c.suppliers.length), 0))]; }) }],
      ['h2', 'The contracts'],
      ['table', ['Published', 'Council', 'What', 'Procedure', 'Value'], { right: [4], rows: cs.map(c => [`[${day(c.published)}](${c.url})`, whoName(c.council), contractLabel(c), procName(c.procedure), eur(c.price)]) }],
      ['small', 'A company is shown by its name and NIF as the public contract data records them. We have not yet read its registry entry.'],
    ], sources: [BASE_SRC] });
  }

  // about
  page({ path: '/about/', kicker: 'About', title: 'About PrompTugal.news Civic', description: 'Who makes PrompTugal.news Civic, how, from which sources, what we could not read, and why it is independent and not official.', blocks: [
    ['lede', 'PrompTugal.news Civic explains public data, public services and the bureaucracy that matters, and maps the links between them (council, contract, company, place). It is part of PrompTugal.news and is made by AI agents with a named human operator, Dinis Cruz.'],
    ['h2', 'Independent, not official'],
    ['p', 'We are not a government site, a council, a public portal or anyone\'s agent. We do not use any public body\'s logo, colours or layout. Official sources are linked so you can check them; for anything that matters, the official page is the authority, not us.'],
    ['h2', 'Take-down: if you think we should not show your data'],
    ['raw', '<p id="take-down">If you think a page on this site should not show your data, or shows it wrongly, <a href="https://github.com/PrompTugal/PrompTugal__News__Civic/issues/new?title=Take-down%20request&amp;labels=take-down">open a public issue on our repository</a> naming the page and what you object to. We take that page or record down while we talk, and say on this page what we changed. Do not put private details (an address, a phone number, a person\'s tax number) in a public issue: name the page and we will find it.</p>', 'If you think a page on this site should not show your data, or shows it wrongly, [open a public issue on our repository](https://github.com/PrompTugal/PrompTugal__News__Civic/issues/new?title=Take-down%20request&labels=take-down) naming the page and what you object to. We take that page or record down while we talk, and say on this page what we changed. Do not put private details in a public issue: name the page and we will find it.'],
    ['p', 'Dinis Cruz, 18 November 2026: "I\'d add a disclaimer on the website that if anybody thinks that we should not have the data on this [they tell us]." Councils\' and public bodies\' published decisions stay shown as public information, with their licence (the source\'s terms) linked.'],
    ['h2', 'How we read sources'],
    ['ul', [
      'Public, official sources only, each value with its source and the date we read it.',
      'Before reading a portal we check its robots.txt and terms. A refusal (a firewall, a 403, a bot check, a login) is respected and recorded below as a gap, never worked around.',
      'We read politely: a named user agent (PrompTugalCivicBot) and two to three seconds between requests.',
      'People only as public and professional: office holders by name and office, as their own body publishes it. **Suppliers who are private individuals keep no name and no NIF here**, and the free-text description of their contracts is left out, because it can name them. Their contracts still count in every total.',
    ]],
    ['h2', 'The portals we checked'],
    ['table', ['Portal', 'robots.txt', 'Terms', 'What happened'], { rows: (portals.portals || []).map(p => [p.host, p.robots, p.terms_url ? `[terms](${p.terms_url})` : 'not found', p.notes]) }],
    ['h2', 'What we could not read'],
    ['ul', (portals.gaps || []), 'gaps'],
    ['h2', 'The data'],
    ['ul', [
      `[data/procurement/base-2026.json](/data/procurement/base-2026.json) and [base-2025.json](/data/procurement/base-2025.json): the 16 councils' contracts, extracted by tools/extract-base.mjs from [IMPIC's open data](${BASE_SRC.url}) (licence as published there: other-pd).`,
      '[data/councils.json](/data/councils.json): where each council publishes its minutes, agendas, notices and budget.',
      '[data/services.json](/data/services.json): the service guides and their official sources.',
      'Place context from [PrompTugal.news by place](https://promptugal.news/algarve/) (data/by-place in PrompTugal__News__Website).',
    ]],
    ['h2', 'How it is made'],
    ['p', 'A static site: Node scripts with no dependencies build every page and its markdown twin from the data files; a gate (scripts/validate.mjs) and a leak scan run on every push. The text is written by civic@PrompTugal.dinis, an AI agent (Opus), with research workers (Sonnet). Nothing on the site has yet been checked by a person; each page says so.'],
    ['p', 'Licences: code Apache-2.0, text CC BY 4.0. Source: [github.com/PrompTugal/PrompTugal__News__Civic](https://github.com/PrompTugal/PrompTugal__News__Civic). For machines: [llms.txt](/llms.txt).'],
  ] });

  // the design pass: three front-page variations side by side
  designPages();

  // copy the data so readers can download it
  mkdirSync(join(OUT, 'data'), { recursive: true });
  cpSync('data', join(OUT, 'data'), { recursive: true });

  // security (Dinis, 18 Nov 2026 ~15:15 UTC: every vulnerability, bug and breach is published)
  {
    const SEV = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const fs = [...security.findings].sort((a, b) => (a.state === 'fixed') - (b.state === 'fixed') || SEV[a.severity] - SEV[b.severity]);
    const blocks = [
      ['lede', 'Every vulnerability, bug and breach we find on this site is published here: what it was, how serious, which file, when and how we found it, the fix and its commit. An open finding shows only its title, severity and state until it is fixed, then in full.'],
      ['p', 'All PrompTugal.news sites: [the central security log](https://promptugal.news/security/). Found something? [Open a public issue](https://github.com/PrompTugal/PrompTugal__News__Civic/issues/new?title=Security) (for anything that could be used before it is fixed, say only that you have something and we will find a private way).'],
      ['h2', 'Findings'],
      fs.length ? ['table', ['Id', 'Finding', 'Severity', 'State', 'Found', 'Fix'], { rows: fs.map(f => [f.id, f.state === 'fixed' ? f.title : f.title, f.severity, f.state, day(f.found.slice(0, 10)), f.state === 'fixed' ? `[${f.commit.slice(0, 7)}](https://github.com/PrompTugal/PrompTugal__News__Civic/commit/${f.commit})` : 'open']) }] : ['p', 'None recorded yet.'],
    ];
    for (const f of fs.filter(f => f.state === 'fixed')) {
      blocks.push(['h3', `${f.id}: ${f.title}`]);
      blocks.push(['ul', [`**Severity:** ${f.severity}. **File:** ${f.file}.`, `**Found:** ${f.found} by ${f.found_by}.`, `**What:** ${f.detail}`, `**Fix:** ${f.fix} Commit [${f.commit.slice(0, 7)}](https://github.com/PrompTugal/PrompTugal__News__Civic/commit/${f.commit}), ${f.fixed}.`]]);
    }
    blocks.push(['h2', 'Threat models']);
    blocks.push(['ul', security.threat_models.map(t => `**${t.name}**: ${t.state === 'published' ? `[${t.file}](https://github.com/PrompTugal/PrompTugal__News__Civic/blob/dev/${t.file})` : t.state}.`)]);
    blocks.push(['p', 'The data behind this page: [data/security/findings.json](/data/security/findings.json).']);
    page({ path: '/security/', kicker: 'About', title: 'Security findings', description: 'Every vulnerability, bug and breach found on PrompTugal.news Civic, with severity, file, fix and commit, and its threat models. Open findings show title, severity and state only until fixed.', blocks, prov: { code: 'scripts/generate.mjs renders this page from data/security/findings.json.' } });
  }

  // municipal companies
  {
    const rows = muniRows(munis.companies).sort((x, y) => y.a.total - x.a.total);
    const tot = rows.reduce((t, x) => t + x.a.total, 0), n = rows.reduce((t, x) => t + x.a.n, 0);
    const blocks = [
      ['lede', `The Algarve's councils also spend through companies they own: water and waste, sport, markets, housing, infrastructure in the resorts. These buy under their own NIF, so their contracts are missing from the councils' totals. In 2026 so far, ${rows.filter(x => x.a.n).length} of them signed ${int(n)} contracts worth ${meur(tot)}, against ${meur(all26.total)} signed by the 16 councils themselves.`],
      ['table', ['Company', 'Council', 'What it does', 'Contracts 2026', 'Value 2026', 'Direct awards', 'Value 2025'], { right: [3, 4, 5, 6], rows: rows.map(({ m, a, b }) => [`[${m.name}](#${m.id})`, `[${whoName(m.council)}](/councils/${m.council}/)`, m.what, int(a.n), meur(a.total), a.n ? pct(a.direct / a.n) : 'n/a', meur(b.total)]) }],
      ['src', `[IMPIC open data on dados.gov.pt](${BASE_SRC.url}), files contratos2026 and contratos2025, read ${day(munis.read_on)}, by each company's NIF. Ownership: [DGAL's list of local companies](${MUNI_SRC.url}), read ${day(munis.read_on)}. Our calculation.`],
      ['note', 'Councils with no company in DGAL\'s list: Albufeira, Alcoutim, Aljezur, Castro Marim, Lagoa, Monchique, São Brás de Alportel, Silves and Vila do Bispo. Infraquinta, Inframoura and Infralobo are 51% owned by Loulé, with the resorts\' owners holding the rest.'],
    ];
    for (const { m, a } of rows) {
      const cs = muniContracts(m.nif, 2026), sups = suppliersOf(cs).sort((x, y) => y.v - x.v).slice(0, 5);
      blocks.push(['raw', `<h2 id="${m.id}">${esc(m.name)}</h2>`, `## ${m.name}`]);
      blocks.push(['p', `Owned by [${whoName(m.council)}](/councils/${m.council}/)${m.council_share_pct ? ` (${m.council_share_pct}%)` : ''}. ${m.what[0].toUpperCase() + m.what.slice(1)}. NIF ${m.nif || 'not found'}. ${m.status_note}`]);
      if (cs.length) {
        blocks.push(['p', `${int(a.n)} contracts in 2026, ${meur(a.total)}; ${pct(a.direct / a.n)} by direct award. Biggest suppliers: ${sups.map(x => companyPages.has(x.nif) ? `[${nm(x.name)}](/map/${x.nif}/) (${meur(x.v)})` : `${nm(x.name)} (${meur(x.v)})`).join('; ') || 'private individuals only (names withheld)'}.`]);
        blocks.push(['table', ['Published', 'What', 'Supplier', 'Procedure', 'Value'], { right: [4], rows: cs.slice(0, 5).map(c => [`[${day(c.published)}](${c.url})`, contractLabel(c), supplierCell(c), procName(c.procedure), eur(c.price)]) }]);
      } else blocks.push(['p', 'No contract published on BASE in 2026.']);
    }
    blocks.push(['p', 'Every contract: [data/procurement/companies-2026.json](/data/procurement/companies-2026.json) and [companies-2025.json](/data/procurement/companies-2025.json); the list of companies: [data/municipal-companies.json](/data/municipal-companies.json).']);
    page({ path: '/money/municipal-companies/', kicker: 'Public money', title: 'The councils\' companies', description: `The municipal companies of the Algarve's councils (water, waste, sport, markets, housing, resort infrastructure) and their ${int(n)} contracts of 2026, which are not in the councils' own totals.`, blocks, sources: [BASE_SRC, MUNI_SRC] });
  }

  // ---------------------------------------------------------------- the API: JSON first (Dinis, 15 Nov 2026: "no data only in
  // HTML ... a REST API of GET calls with a mature Swagger"). Static GET files under /api/v1/, described by /api/v1/openapi.json.
  const API = join(OUT, 'api', 'v1');
  const put = (rel, obj) => { const f = join(API, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(obj, null, 1) + '\n'); };
  const meta = { site: 'PrompTugal.news Civic (independent, not a government or official site)', version: '__VERSION__', license: OURS, license_note: 'CC BY 4.0 covers our calculations and text; each source and each record keeps its own license, given beside it.', licence: 'CC BY 4.0 (our text and calculations); public data as each source publishes it' };
  const baseSrc = { license: IMPIC_LICENCE, title: BASE_SRC.title, url: BASE_SRC.url, read_on: BASE_SRC.read_on, published_up_to: lastPub };
  const sumOut = x => ({ contracts: x.n, value_eur: Math.round(x.total), direct_awards: x.direct, direct_award_share: x.n ? +(x.direct / x.n).toFixed(3) : null, open_tenders: x.open, by_procedure: Object.fromEntries(Object.entries(x.byProc).map(([k, v]) => [k, { label_en: procName(k), contracts: v.n, value_eur: Math.round(v.v) }])) });
  const councilOut = id => {
    const co = councilOf(id), cs = by26[id];
    return { id, name: whoName(id), nif: base[2026].councils[id] ? base[2026].councils[id].nif : null, page: `${SITE}/councils/${id}/`,
      contracts_2026: sumOut(summarise(cs)), contracts_2025: sumOut(summarise(by25[id])),
      top_suppliers_2026: suppliersOf(cs).sort((a, b) => b.v - a.v).slice(0, 10).map(x => ({ nif: x.nif, name: x.name, contracts: x.n, value_eur: Math.round(x.v), page: companyPages.has(x.nif) ? `${SITE}/map/${x.nif}/` : null })),
      withheld_private_individuals_2026: cs.filter(c => c.suppliers.some(x => x.withheld)).length,
      where_published: { site: co.site ? { url: co.site, license: licenceOf(co.site) } : null, ...Object.fromEntries(['minutes', 'agendas', 'assembly', 'notices', 'budget', 'procurement'].map(k => [k, co[k] ? { ...co[k], license: licenceOf(co[k].url) } : null])), mayor: co.mayor ? { ...co.mayor, license: licenceOf(co.mayor.source) } : null, read_on: co.read_on || councilsData.read_on || null, gaps: co.gaps || [] },
      municipal_companies: muniRows(muniOf(id)).map(({ m, a, b }) => ({ id: m.id, name: m.name, nif: m.nif, what: m.what, status: m.status, contracts_2026: a.n, value_eur_2026: Math.round(a.total), value_eur_2025: Math.round(b.total) })),
      contracts_list: `${SITE}/data/procurement/base-2026.json`, sources: [baseSrc] };
  };
  put('index.json', { ...meta, about: 'Every GET call of this site. Described by openapi.json.', endpoints: ['/api/v1/councils.json', '/api/v1/councils/{id}.json', '/api/v1/companies.json', '/api/v1/companies/{nif}.json', '/api/v1/services.json', '/api/v1/services/{id}.json', '/api/v1/procurement/summary.json', '/api/v1/municipal-companies.json', '/api/v1/use-cases/tech-and-ai.json', '/api/v1/billing/meter.json', '/api/v1/openapi.json'] });
  // Dinis, 18 Nov 2026 ~22:20 UTC (Website repo board/guidance/2026-11-18-london.md): London is the first place beyond Portugal,
  // so no record assumes a place is Portuguese: each one says its country, region and currency.
  const PLACE_PT = { country: { code: 'PT', name: 'Portugal' }, region: 'Algarve', currency: 'EUR' };
  put('councils.json', { ...meta, councils: COUNCIL_IDS.map(id => { const x = summarise(by26[id]); return { id, name: whoName(id), ...PLACE_PT, contracts_2026: x.n, value_eur_2026: Math.round(x.total), direct_award_share_2026: x.n ? +(x.direct / x.n).toFixed(3) : null, site_read: !!councilOf(id).site, href: `/api/v1/councils/${id}.json` }; }), sources: [baseSrc] });
  for (const id of COUNCIL_IDS) put(`councils/${id}.json`, { ...meta, ...PLACE_PT, ...councilOut(id) });
  put('companies.json', { ...meta, about: 'Companies with contracts at three or more of the Algarve\'s 16 councils in 2026. Private individuals are never listed.', companies: multi.map(x => ({ nif: x.nif, name: x.name, councils: x.councils.size, contracts: x.n, value_eur: Math.round(x.v), href: `/api/v1/companies/${x.nif}.json` })), sources: [baseSrc] });
  for (const x of multi) put(`companies/${x.nif}.json`, { ...meta, nif: x.nif, name: x.name, page: `${SITE}/map/${x.nif}/`,
    by_council: [...x.councils].map(id => { const cs = x.contracts.filter(c => c.council === id); return { council: id, name: whoName(id), contracts: cs.length, value_eur: Math.round(cs.reduce((t, c) => t + (c.price || 0) / Math.max(1, c.suppliers.length), 0)) }; }).sort((a, b) => b.value_eur - a.value_eur),
    contracts: x.contracts.map(c => ({ license: IMPIC_LICENCE, id: c.id, council: c.council, object: c.object, procedure: c.procedure, procedure_en: procName(c.procedure), price_eur: c.price, signed: c.signed, published: c.published, base_gov_pt: c.url })),
    note: 'value_eur splits a contract with several suppliers equally between them (our calculation).', sources: [baseSrc] });
  const withLic = o => o && typeof o === 'object' ? (Array.isArray(o) ? o.map(withLic) : Object.fromEntries(Object.entries(o).map(([k, v]) => [k, withLic(v)]).concat((o.url || o.source) && typeof (o.url || o.source) === 'string' && /^https?:/.test(o.url || o.source) ? [['license', licenceOf(o.url || o.source)]] : []))) : o;
  put('services.json', { ...meta, read_on: services.read_on, guides: services.guides.map(g => ({ id: g.id, title: g.title, summary: g.summary, license: OURS, page: `${SITE}/services/${g.id}/`, href: `/api/v1/services/${g.id}.json` })), offices: withLic(services.offices) });
  for (const g of services.guides) put(`services/${g.id}.json`, { ...meta, ...withLic(g), page: `${SITE}/services/${g.id}/`, note: 'Our summary of official pages, not official advice. The official page is the authority.' });
  // the government track's first use case: what the councils buy in tech and AI (civic.b@, 18 Nov 2026; Dinis, 16:00 UTC:
  // "tech, AI ... government and connecting data and reducing bureaucracy")
  {
    const TECH = /^(48|72|302)/;   // CPV 48 software packages, 72 IT services, 302 computer equipment
    const AI = /intelig[eê]ncia artificial|machine learning|aprendizagem autom[aá]tica|chatbot|assistente virtual/i;
    const AI_ABBR = /(?<!\p{L})IA(?!\p{L})/u;   // "IA" in capitals between non-letters (not Bóia, JÓIA)
    const isTech = c => (c.cpv || []).some(x => TECH.test(x.id || ''));
    const isAI = c => !!c.object && !c.suppliers.some(x => x.withheld) && (AI.test(c.object) || AI_ABBR.test(c.object));   // never a withheld contract's text, whatever the data says
    const t26 = y26.filter(isTech), t25 = y25.filter(isTech);
    const ai = [...y26, ...y25].filter(isAI).sort((a, b) => (b.published || '').localeCompare(a.published || ''));
    const per = COUNCIL_IDS.map(id => { const a = summarise(t26.filter(c => c.council === id)), all = summarise(by26[id]), b = summarise(t25.filter(c => c.council === id)); return { id, a, b, share: all.total ? a.total / all.total : 0 }; }).sort((x, y) => y.a.total - x.a.total);
    const s26 = summarise(t26), s25 = summarise(t25);
    const sups = suppliersOf(t26).sort((a, b) => b.v - a.v).slice(0, 15);
    const cpvTop = Object.entries(t26.reduce((m, c) => { for (const x of c.cpv || []) if (TECH.test(x.id || '')) { const k = `${x.id} ${x.desc}`; m[k] = (m[k] || 0) + (c.price || 0) / Math.max(1, c.cpv.filter(y => TECH.test(y.id || '')).length); } return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const blocks = [
      ['lede', `What the Algarve's 16 councils buy in software, IT services and computer equipment, and where they are buying artificial intelligence. In 2026 so far: ${int(s26.n)} contracts, ${meur(s26.total)} (${pct(s26.total / all26.total)} of everything they contracted), ${pct(s26.direct / Math.max(1, s26.n))} of them direct awards. In 2025: ${int(s25.n)} contracts, ${meur(s25.total)}.`],
      ['note', '**How we count.** A contract counts as tech when one of its CPV codes (the EU\'s common procurement vocabulary, as the council recorded it) starts 48 (software packages and information systems), 72 (IT services: consulting, development, internet and support) or 302 (computer equipment). A contract mentions AI when its published description contains "inteligência artificial", "IA" (in capitals, as a word), "machine learning", "aprendizagem automática", "chatbot" or "assistente virtual" (our search; a description can mention AI in passing). Councils only: their municipal companies are on [their own page](/money/municipal-companies/).'],
      ['h2', 'By council, 2026'],
      ['table', ['Council', 'Tech contracts', 'Value', 'Share of all its contracts', 'Direct awards', 'Value 2025'], { right: [1, 2, 3, 4, 5], rows: per.map(({ id, a, b, share }) => [`[${whoName(id)}](/councils/${id}/)`, int(a.n), meur(a.total), pct(share), a.n ? pct(a.direct / a.n) : 'n/a', meur(b.total)]) }],
      ['h2', 'What they buy'],
      ['table', ['CPV code and what it means (as recorded)', 'Value 2026'], { right: [1], rows: cpvTop.map(([k, v]) => [k, meur(v)]) }],
      ['h2', 'Their biggest tech suppliers, 2026'],
      sups.length ? ['table', ['Supplier', 'NIF', 'Contracts', 'Value', 'Councils'], { right: [2, 3, 4], rows: sups.map(x => [companyPages.has(x.nif) ? `[${nm(x.name)}](/map/${x.nif}/)` : nm(x.name), x.nif, int(x.n), meur(x.v), String(x.councils.size)]) }] : ['p', 'None.'],
      ['small', 'Companies and public bodies only; contracts with private individuals count in the totals with their names withheld. A contract with several suppliers is split equally between them.'],
      ['h2', 'Contracts that mention artificial intelligence, 2025 and 2026'],
      ai.length ? ['table', ['Published', 'Council', 'What', 'Supplier', 'Procedure', 'Value'], { right: [5], rows: ai.map(c => [`[${day(c.published)}](${c.url})`, `[${whoName(c.council)}](/councils/${c.council}/)`, contractLabel(c), supplierCell(c), procName(c.procedure), eur(c.price)]) }] : ['p', 'None found.'],
      ['h2', 'What this is for'],
      ['p', 'Councils are buying software and AI to answer people, process applications and run services: the same steps our [service guides](/services/) explain. Knowing who buys what, from whom and how lets a council compare notes with its neighbours, and lets a resident see where the money for "digital" goes. The next step is to link each of these contracts to the council meeting that approved it and the Diário da República notice, and to ask, with each council, which bureaucratic step the purchase removed.'],
    ];
    page({ path: '/money/tech-and-ai/', kicker: 'Public money', title: 'What the councils buy in tech and AI', description: `Software, IT services, computer equipment and artificial intelligence bought by the Algarve's 16 councils: ${int(s26.n)} contracts worth ${meur(s26.total)} in 2026, by council, supplier and code, from IMPIC's open data.`, blocks, sources: [BASE_SRC] });
    put('use-cases/tech-and-ai.json', { ...meta, about: 'Contracts of the 16 Algarve councils with a CPV code starting 48, 72 or 302 (tech), and contracts whose description mentions AI, 2025 and 2026. Our calculation.', year_2026: sumOut(s26), year_2025: sumOut(s25), by_council_2026: per.map(({ id, a, share }) => ({ council: id, contracts: a.n, value_eur: Math.round(a.total), share_of_council_total: +share.toFixed(3) })), top_suppliers_2026: sups.map(x => ({ nif: x.nif, name: x.name, contracts: x.n, value_eur: Math.round(x.v), councils: x.councils.size })), ai_mentions: ai.map(c => ({ license: IMPIC_LICENCE, id: c.id, council: c.council, published: c.published, object: c.object, price_eur: c.price, procedure: c.procedure, base_gov_pt: c.url })), sources: [baseSrc] });
  }

  put('municipal-companies.json', { ...meta, about: munis.about, read_on: munis.read_on, companies: muniRows(munis.companies).map(({ m, a, b }) => ({ ...m, ownership_license: MUNI_SRC.license, contracts_license: IMPIC_LICENCE, contracts_2026: sumOut(a), contracts_2025: sumOut(b) })), contracts: [`${SITE}/data/procurement/companies-2026.json`, `${SITE}/data/procurement/companies-2025.json`], sources: [...(munis.sources || []), baseSrc], gaps: munis.gaps || [] });
  put('procurement/summary.json', { ...meta, year_2026: sumOut(all26), year_2025: sumOut(all25), companies_at_three_or_more_councils: multi.length, sources: [baseSrc] });
  const ref = n => ({ $ref: `#/components/schemas/${n}` }), obj = { type: 'object' };
  const get = (summary, schema, param) => ({ get: { summary, ...(param ? { parameters: [{ name: param, in: 'path', required: true, schema: { type: 'string' } }] } : {}), responses: { 200: { description: 'OK', content: { 'application/json': { schema } } }, 404: { description: 'Not found' } } } });
  put('openapi.json', { openapi: '3.1.0',
    info: { title: 'PrompTugal.news Civic API', version: '__VERSION__', description: 'Read-only GET calls, static JSON files. Independent: not a government or official API. Public procurement of the Algarve\'s 16 councils from IMPIC\'s open data, where each council publishes its decisions, and public-service guides from official pages. Every value carries its source and the date read.', license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' } },
    servers: [{ url: SITE }],
    paths: {
      '/api/v1/index.json': get('The list of endpoints', obj),
      '/api/v1/councils.json': get('The 16 Algarve councils, with 2026 totals', obj),
      '/api/v1/councils/{id}.json': get('One council: contracts 2026 and 2025 by procedure, top suppliers, where its minutes, agendas, notices and budget are published', ref('Council'), 'id'),
      '/api/v1/companies.json': get('Companies with contracts at three or more councils in 2026', obj),
      '/api/v1/companies/{nif}.json': get('One company: its contracts with the Algarve councils in 2026', obj, 'nif'),
      '/api/v1/services.json': get('Public-service guides and which office does what', obj),
      '/api/v1/services/{id}.json': get('One guide, step by step, with official pages', obj, 'id'),
      '/api/v1/procurement/summary.json': get('Totals for the 16 councils, 2026 and 2025', obj),
      '/api/v1/use-cases/tech-and-ai.json': get('Tech and AI purchases of the 16 councils: by council, supplier, and contracts that mention AI', obj),
      '/api/v1/municipal-companies.json': get('The councils\' municipal companies, with their contracts by procedure, 2026 and 2025', obj),
      '/api/v1/billing/meter.json': get('The reading meter\'s prices for this site', obj),
      '/data/procurement/base-2026.json': get('Every 2026 contract of the 16 councils (large)', obj),
    },
    components: { schemas: { Council: { type: 'object', required: ['id', 'name', 'contracts_2026', 'sources'], properties: { id: { type: 'string' }, name: { type: 'string' }, nif: { type: ['string', 'null'] }, contracts_2026: obj, contracts_2025: obj, top_suppliers_2026: { type: 'array' }, where_published: obj, sources: { type: 'array' } } } } } });
  page({ path: '/api/', kicker: 'For machines', title: 'The Civic API', description: 'Read-only JSON GET calls for every council, company and service guide on PrompTugal.news Civic, described by OpenAPI 3.1. Independent, not an official API.', blocks: [
    ['lede', 'Everything on this site is also JSON: one GET call per council, per company and per service guide, as static files. Use them, cite them (CC BY 4.0), and check the official sources each one names.'],
    ['note', '**Independent.** Not a government or official API. Values come from IMPIC\'s open data and the councils\' own sites, each with the date we read it.'],
    ['table', ['Call', 'What it returns'], { rows: [
      ['[/api/v1/openapi.json](/api/v1/openapi.json)', 'The description of every call (OpenAPI 3.1)'],
      ['[/api/v1/councils.json](/api/v1/councils.json)', 'The 16 councils with their 2026 totals'],
      [`[/api/v1/councils/faro.json](/api/v1/councils/faro.json)`, 'One council: contracts by procedure (2026, 2025), top suppliers, where its minutes, agendas, notices and budget are published'],
      ['[/api/v1/companies.json](/api/v1/companies.json)', `The ${multi.length} companies with contracts at three or more councils`],
      [`[/api/v1/companies/${multi[0].nif}.json](/api/v1/companies/${multi[0].nif}.json)`, 'One company and its contracts'],
      ['[/api/v1/services.json](/api/v1/services.json)', 'The service guides and which office does what'],
      ['[/api/v1/procurement/summary.json](/api/v1/procurement/summary.json)', 'Totals for the 16 councils, 2026 and 2025'],
      ['[/api/v1/municipal-companies.json](/api/v1/municipal-companies.json)', 'The councils\' municipal companies and their contracts by procedure'],
      ['[/data/procurement/base-2026.json](/data/procurement/base-2026.json)', 'Every 2026 contract (large file)'],
    ] }],
    ['p', 'Private individuals who are suppliers are never named, in the API as on the pages; they still count in totals. A contract shared by several suppliers is split equally between them in company totals (our calculation).'],
  ], prov: { code: 'scripts/generate.mjs writes these JSON files from data/ at every build, with the same numbers as the pages.' } });

  // the sites bar's preview (Dinis, 18 Nov 2026 ~22:00 UTC: an infographic of each site's own live numbers, with provenance
  // and licence): /preview.svg at every build; /preview.png from it by tools/preview-png.mjs (a social card).
  {
    const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const mc = munis.companies.filter(m => m.nif).length;
    const read = (councilsData.councils || []).filter(c => c.site).length;
    const figs = [
      [int(all26.n), 'council contracts in 2026'],
      [meur(all26.total).replace(' million €', ' M€'), 'contracted, ' + pct(all26.direct / all26.n) + ' direct awards'],
      [String(multi.length), 'firms at 3+ councils'],
      [String(mc), 'municipal companies mapped'],
      [`${read}/16`, 'council sites read'],
      [String(services.guides.length + 1), 'public-service guides'],
    ];
    const W = 1200, H = 630;
    const cells = figs.map(([n, l], i) => { const x = 60 + (i % 3) * 370, y = 230 + Math.floor(i / 3) * 170;
      return `<text x="${x}" y="${y}" font-family="Georgia,serif" font-size="64" fill="#121317">${xe(n)}</text><text x="${x}" y="${y + 40}" font-family="Arial,sans-serif" font-size="22" fill="#555">${xe(l)}</text>`; }).join('');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<title id="t">PrompTugal.news Civic: public money and public services, explained</title>
<desc id="d">${xe(figs.map(f => f.join(' ')).join('; '))}. Source: IMPIC open data (dados.gov.pt), read ${xe(BASE_SRC.read_on)}; our calculation, CC BY 4.0. Independent, not an official site.</desc>
<rect width="${W}" height="${H}" fill="#f6f3ec"/><rect width="${W}" height="10" fill="#c52830"/>
<text x="60" y="95" font-family="Georgia,serif" font-size="46" fill="#121317">PrompTugal.news <tspan fill="#006600" font-family="Arial,sans-serif" font-size="34" font-weight="bold">· CIVIC</tspan></text>
<text x="60" y="140" font-family="Arial,sans-serif" font-size="26" fill="#333">Public money, public services and bureaucracy in the Algarve, explained and cross-mapped</text>
${cells}
<text x="60" y="572" font-family="Arial,sans-serif" font-size="18" fill="#666">Independent, not a government site. Source: IMPIC open data (dados.gov.pt, Outra (Domínio Público)), read ${xe(day(BASE_SRC.read_on))},</text>
<text x="60" y="598" font-family="Arial,sans-serif" font-size="18" fill="#666">and the councils' own sites. Our calculation, CC BY 4.0. civic.promptugal.news, version __VERSION__.</text>
</svg>
`;
    writeFileSync(join(OUT, 'preview.svg'), svg);
    put('preview.json', { ...meta, about: 'The figures in /preview.svg, for the PrompTugal.news sites bar.', figures: figs.map(([value, label]) => ({ value, label })), sources: [baseSrc] });
  }

  // llms.txt and sitemap.xml
  const llms = `# PrompTugal.news Civic\n\n> Independent (not a government site): public money, public services and bureaucracy in Portugal, explained and cross-mapped, starting with the Algarve's 16 councils. Every page has a markdown twin at <path>index.md. Version __VERSION__.\n\n## Pages\n\n${pages.filter(p => !p.path.startsWith('/design/')).map(p => `- [${nodash(p.title)}](${SITE}${p.path}index.md): ${nodash(p.description)}`).join('\n')}\n\n## Data\n\n- [Contracts 2026](${SITE}/data/procurement/base-2026.json)\n- [Contracts 2025](${SITE}/data/procurement/base-2025.json)\n- [Councils](${SITE}/data/councils.json)\n- [Services](${SITE}/data/services.json)\n- [API (OpenAPI 3.1)](${SITE}/api/v1/openapi.json): one JSON GET per council, company and service guide\n`;
  writeFileSync(join(OUT, 'llms.txt'), llms);
  writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `<url><loc>${SITE}${p.path}</loc></url>`).join('\n')}\n</urlset>\n`);
  writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  return pages.length;
}

// ---------------------------------------------------------------- design variations
const SHORT = { 'vila-real-de-santo-antonio': 'VRSA', 'vila-do-bispo': 'V. do Bispo', 'sao-bras-de-alportel': 'S. Brás', 'castro-marim': 'C. Marim' };
function designPages() {
  const top = COUNCIL_IDS.map(id => ({ id, s: summarise(by26[id]) })).sort((a, b) => b.s.total - a.s.total);
  const max = top[0].s.total;
  const placeDots = places.places.filter(p => p.at).map(p => { const s = summarise(by26[p.id]); const x = (p.at[0] + 8.95) / 1.6 * 560 + 20, y = (37.5 - p.at[1]) / 0.5 * 200 + 20; return `<a href="/councils/${p.id}/"><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(4 + Math.sqrt(s.total / max) * 22).toFixed(1)}" fill="var(--red)" fill-opacity=".55" stroke="var(--ink)" stroke-width=".6"><title>${esc(p.name)}: ${esc(meur(s.total))}</title></circle><text x="${x.toFixed(0)}" y="${(y + 3).toFixed(0)}" font-size="9" text-anchor="middle" fill="var(--ink)" font-family="IBM Plex Mono, monospace">${esc(SHORT[p.id] || p.name)}</text></a>`; }).join('');
  const variants = {
    a: { name: 'A · The ledger', why: 'Numbers first: the money table leads, like a public ledger. Best for readers who come for procurement.', blocks: [
      ['raw', `<p class="lede">What the Algarve's 16 councils have bought in 2026, from whom and how. Independent; every number linked to its source.</p><div class="grid"><div class="card money"><div class="stat">${esc(meur(all26.total))}</div><p>contracted in 2026</p></div><div class="card money"><div class="stat">${int(all26.n)}</div><p>contracts</p></div><div class="card money"><div class="stat">${pct(all26.direct / all26.n)}</div><p>direct awards</p></div></div><div class="tbl"><table><thead><tr><th>Council</th><th class="r">Value</th><th></th></tr></thead><tbody>${top.map(({ id, s }) => `<tr><td><a href="/councils/${id}/">${esc(whoName(id))}</a></td><td class="r num">${esc(meur(s.total))}</td><td><span class="bar" style="width:${Math.round(s.total / max * 200)}px"></span></td></tr>`).join('')}</tbody></table></div><p><a href="/services/">Public services, step by step</a> · <a href="/map/">The cross-map</a></p>`, 'Variation A: the ledger. The money table leads.'],
    ] },
    b: { name: 'B · The help desk', why: 'Services first: "how do I...?" leads, money second. Best for residents and newcomers.', blocks: [
      ['raw', `<p class="lede">How do I...? The everyday bureaucracy, step by step, from official pages.</p><div class="grid">${services.guides.map(g => `<div class="card services"><h3><a href="/services/${g.id}/">${esc(nodash(g.title))}</a></h3><p>${esc(nodash(g.summary || ''))}</p></div>`).join('')}<div class="card services"><h3><a href="/services/which-office/">Which office does what</a></h3><p>Eight offices, one line each.</p></div></div><h2>And where the money goes</h2><p>${int(all26.n)} contracts worth ${esc(meur(all26.total))} signed by the Algarve's 16 councils in 2026. <a href="/money/">Read the ledger</a>.</p>`, 'Variation B: the help desk. Service guides lead.'],
    ] },
    c: { name: 'C · The map', why: 'Place first: the 16 councils on a map, sized by money contracted; click one. Best for the cross-mapping and for local readers.', blocks: [
      ['raw', `<p class="lede">Sixteen councils, one coast. Each circle is a council, sized by what it contracted in 2026. Pick one.</p><svg viewBox="0 0 600 240" role="img" aria-label="The Algarve's councils sized by money contracted in 2026" style="width:100%;height:auto;background:var(--card);border:1px solid var(--rule)">${placeDots}</svg><p class="src">Positions from PrompTugal.news by place; values from IMPIC's open data, read ${day(BASE_SRC.read_on)}.</p><div class="grid"><div class="card money"><h3><a href="/money/">Public money</a></h3><p>${esc(meur(all26.total))} in ${int(all26.n)} contracts.</p></div><div class="card services"><h3><a href="/services/">Public services</a></h3><p>Five guides, step by step.</p></div><div class="card"><h3><a href="/map/">Cross-map</a></h3><p>${multi.length} companies working for three or more councils.</p></div></div>`, 'Variation C: the map. Councils on a map, sized by money.'],
    ] },
  };
  for (const [k, v] of Object.entries(variants)) page({ path: `/design/${k}/`, kicker: 'Design pass: front page', title: v.name, description: `Front page variation ${k.toUpperCase()} for PrompTugal.news Civic: ${v.why}`, blocks: [['note', `Design variation for Dinis to choose. ${v.why}`], ...v.blocks], prov: { code: 'scripts/generate.mjs (designPages) renders this variation from the same data as the front page.' } });
  page({ path: '/design/', kicker: 'Design pass', title: 'Three front pages, side by side', description: 'Three variations of the PrompTugal.news Civic front page for Dinis to choose: the ledger, the help desk and the map.', blocks: [
    ['lede', 'One design pass: three ways to open the site, built from the same data. The live front page today is closest to A with B\'s cards. Dinis chooses.'],
    ['raw', `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))">${Object.entries(variants).map(([k, v]) => `<div class="card"><h3><a href="/design/${k}/">${esc(v.name)}</a></h3><p>${esc(v.why)}</p><iframe src="/design/${k}/" title="${esc(v.name)}" loading="lazy" style="width:100%;height:520px;border:1px solid var(--rule);background:var(--paper)"></iframe></div>`).join('')}</div>`, Object.entries(variants).map(([k, v]) => `- [${v.name}](/design/${k}/): ${v.why}`).join('\n')],
  ], prov: { code: 'scripts/generate.mjs (designPages).' } });
}

if (process.argv[1] && process.argv[1].endsWith('generate.mjs')) console.log(`generated ${generate()} pages`);
