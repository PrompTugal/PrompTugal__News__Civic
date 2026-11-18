# Hand-over: civic.b@PrompTugal.dinis, first run on account B (18 November 2026)

Carries on from `2026-11-17-first-version.md`. Public repository: no keys, tokens or contacts here.

## Dinis's words

- 18 November 2026, about 02:30 UTC, to conductor.b@PrompTugal.dinis (kept in `board/guidance/2026-11-18-five-sites-on-account-b.md` in PrompTugal__News__Website): "add observability to all the other sites like the data and the stuff"; the leads on this account are named `.b`. The fixes he listed: the session key, the commit check accepting @PrompTugal.dinis, the masthead chip "Pay for what you read · £balance", the reading graph on the account page, the sites rail, IPMA pages outside the meter, and front page A, B or C kept for himself.

## What I did (about 09:30 to 10:15 UTC)

1. **Session key: blocked.** The permission system refused to run the downloaded `pki-agent.mjs`, even `help`. Not worked around. `board/keys.json` lists `civic.b-promptugal` as pending. Nothing is signed.
2. **Commit check: done.** `scripts/check-commits.mjs` accepts `role@AgentiCCells.person` or `role@PrompTugal.person`. Commits now carry `Agent: civic.b@PrompTugal.dinis`.
3. **Masthead: done, live in v0.1.5.** The chip in the masthead on every page (kept visible on phones; promptugal.news's meter.css hides it under 768px), `/account/` with the balance, the reading graph and the history, and the sites rail at the right edge (a row under the masthead below 1180px). The meter is the Website's `assets/meter/meter.js` and the sg-meter core, copied at f261682; the changes are listed in each file's header. Config: `src/api/v1/billing/meter.json`, this site's own storage key, every page 1p read to the end (reference pages), the account page free, top-ups on promptugal.news.
4. **IPMA: nothing to do.** No page here is built on IPMA data.
5. **Observability: done.** `src/assets/obs/obs.js` on every page; each event says `lane: civic`. The vault, drain key and shared site lanes are read at run time from `https://promptugal.news/assets/obs/obs.json` (CORS open), so no token sits in this repository and the leak scan stays clean without an allowlist entry. Civic's own tokens, once observability@ issues them, go in `lanes.civic` of `src/assets/obs/obs.json`.
6. **Councils retried once from this network.** Castro Marim (cm-castromarim.pt) and Vila do Bispo (www.cm-viladobispo.pt) answered; Aljezur, Faro, Loulé, Monchique, São Brás de Alportel, Silves and Vila Real de Santo António still reset the connection (robots.txt requests, 18 November about 09:40 UTC). civic.b.research.councils@ (Sonnet) read the two that answered (21 requests, Castro Marim at its 10-second crawl delay); I checked both mayors' names at source and merged them into `data/councils.json`. 9 of 16 council sites are now mapped.

## What I learnt

- A balance cannot cross sites: each origin has its own localStorage, so civic's balance is separate from promptugal.news's. The account page says so. One balance across the five sites needs the vault ("Carry it to another device") or a shared origin; not built.
- GitHub Pages serves `access-control-allow-origin: *`, so a sub-site can read promptugal.news's public JSON at run time instead of copying it.
- Tested in headless Chromium with the observability requests intercepted: the chip went £5.00 to £4.97 over three pages, the graph drew, no horizontal scroll at 390px.

## What is next (in order)

1. The seven councils that still refuse: try once from a different network, if a session has one.
2. Read the minutes listings and link the largest contracts to the meeting (ata) that decided them, and to their Diário da República notice.
3. Municipal companies (water, waste, sport, housing): their NIFs and contracts on each council page.
4. Earlier years and the "Anúncios" and "Modificações contratuais" datasets.
5. Services: the Multibanco steps from a page we can open; Chave Móvel Digital, IMI, the parish atestado, water and waste bills.

## What Dinis must decide

- Allow this session to run `pki-agent.mjs keygen --session`, or say which key to use.
- Ask observability@ (account A) for civic's own append lane tokens.
- Front page A, B or C at https://civic.promptugal.news/design/ (not waited on).
- Keep or change the rule that withholds private individuals who are suppliers.
