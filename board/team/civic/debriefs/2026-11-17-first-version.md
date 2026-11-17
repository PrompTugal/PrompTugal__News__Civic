# Hand-over: civic@PrompTugal.dinis, first version (17 November 2026)

Written so a session on another account can carry on. Public repository: no keys, tokens or contacts here.

## Dinis's words

- Focus (17 November 2026, via the conductor): "Public data, public services and the typical bureaucracy that is important, that very few understand, and that has very few cross-mappings." The full brief is `BRIEF.md`.

## What exists

- https://civic.promptugal.news, deployed from `dev` by `.github/workflows/pages.yml`. 208 pages, each with a markdown twin. See `REALITY.md` for the list.
- **Public money:** the 16 Algarve councils' contracts for 2026 (3,396, about 304 million euros as published, published up to 13 November 2026) and 2025 (4,306), from IMPIC's open data on dados.gov.pt (dataset 66d72d488ca4b7cb2de28712, licence other-pd as published, read 2026-11-17). Our calculation: 51% of 2026 contracts were direct awards.
- **Councils:** one page each, with totals, top suppliers, latest 15 contracts, and where minutes, agendas, notices and budgets are published (7 of 16 sites read).
- **Services:** four guides plus "which office does what", each step linked to an official page and dated. Weak spots are labelled on the page (the Multibanco steps rest on search summaries of pages we could not open).
- **Cross-map:** 177 companies (by NIF) with contracts at three or more councils, each with its own page, linked both ways with the councils.
- **Design pass:** `/design/` shows A (ledger), B (help desk) and C (map of councils sized by money) side by side. The live front page is closest to A with B's cards.

## Rules this site applies (keep them)

- Suppliers who are private individuals (NIF masked as "-" in the open data, or a natural-person NIF prefix 1, 2, 3, 45 or 8) keep no name, no NIF and no free-text contract object, in the data files as in the pages. They still count in totals. Code: `isPerson` in `tools/extract-base.mjs`.
- Office holders by name only as their own council's site gives them, with the page.
- A refusal is a gap, never worked around (`data/portals.json`, shown on `/about/`).

## What I learnt

- base.gov.pt's search XHR returns a WebKnight firewall alert to a named bot. The same data is on dados.gov.pt as yearly JSON inside zips (about 70 MB zipped, 630 to 730 MB unzipped). Node cannot hold a file over 512 MB as one string, so `tools/extract-base.mjs` streams the top-level array object by object (7 seconds a year).
- IMPIC's 2026 file holds contracts by their year, so some were published on BASE in December 2025.
- Nine council sites (Aljezur, Castro Marim, Faro, Loulé, Monchique, São Brás de Alportel, Silves, Vila do Bispo, Vila Real de Santo António) reset the connection from this cloud environment. That may be geo or IP filtering of cloud addresses rather than a refusal of us. A session from another network may get through: try once, politely, and record what happens.
- Alcoutim's and Olhão's sites are client-rendered (Next.js), so minute lists are invisible without a browser.
- diariodarepublica.pt is an OutSystems JavaScript app with no robots.txt; we link it, we do not read it.
- aima.gov.pt fails TLS verification through the proxy; sns.gov.pt answers 405; bportugal.pt shows a browser check.

## What is next (in order)

1. Dinis chooses a front page at `/design/`; apply it.
2. The nine blocked councils: retry once from another network. Then read the minutes listings: link each large contract to the meeting (ata) that decided it, and to its Diário da República notice.
3. Municipal companies (water, waste, sport, housing): find their NIFs and add their contracts to each council page.
4. Earlier years (IMPIC publishes from 2012) and trends per council. Add the "Anúncios" and "Modificações contratuais" datasets (tenders announced, contract changes).
5. Company pages: add the place each supplier is registered (from BASE's "Entidades" dataset on dados.gov.pt) against where the work is done.
6. Services: re-read the Multibanco steps from a page we can open (a bank's or SIBS's public page). Add AIMA steps once aima.gov.pt is reachable. Add guides: Chave Móvel Digital, IMI, the parish atestado, water and waste bills.
7. Move reading to data.promptugal.news once its API exists (the Data team owns collectors).
8. Signing: make the session key, publish it in `board/keys.json`, sign the twins.

## What blocks me / what Dinis must decide

- **Dinis:** the session's permissions refused `pki-agent.mjs keygen --session`. Allow it in the next session, or say which key to use. Nothing is signed until then.
- **Dinis:** the template's commit gate accepts only `Agent: role@AgentiCCells.person`, while the five-sites brief says `civic@PrompTugal.dinis`. I used `Agent: civic@AgentiCCells.dinis` plus `Role: civic@PrompTugal.dinis`. Which do you want? (`BRIEF-CORRECTIONS.md`)
- **Dinis:** pick a front page at https://civic.promptugal.news/design/.
- **Dinis:** is the rule that withholds private individuals who are suppliers (including the contract text) what you want? It hides 392 of the 3,396 contracts' descriptions.
- Nothing has been checked by a person yet; every page says so.

## Where things live

- Code: `scripts/generate.mjs` (all pages), `tools/extract-base.mjs`, `tools/import-places.mjs`, `src/assets/civic.css`.
- Data: `data/`. Raw downloads are not committed: re-download from dados.gov.pt.
- Workers this run: civic.research.services@ (Sonnet) wrote `data/services.json`; civic.research.councils@ (Sonnet) wrote `data/councils.json`. I reviewed both, removed a duplicate guide, fixed a mis-sourced office row, and set unconfirmed council domains to null.
