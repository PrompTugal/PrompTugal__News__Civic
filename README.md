# PrompTugal.news Civic

**Domain:** https://civic.promptugal.news

**Focus:** Public data, public services and bureaucracy, explained and cross-mapped: public money (procurement on base.gov.pt, council decisions and minutes, the Diario da Republica), how public services work (paying bills, NIF, SNS, AIMA), and the links between councils, contracts, companies and places. Independent: never presented as an official government site.

Part of [PrompTugal.news](https://promptugal.news/) (Portugal, town by town). It reads its raw data from [data.promptugal.news](https://data.promptugal.news/).

## Status
First version (17 November 2026): public money (the Algarve's 16 councils' contracts from IMPIC's open data), one page per council, public-service guides, a council-contract-company cross-map, and three front-page designs at /design/. What exists is in `REALITY.md`; the brief is `BRIEF.md`. Built by civic@PrompTugal.dinis and its workers.

## Build
```
node scripts/build.mjs && node scripts/validate.mjs && node scripts/leak-scan.mjs
```
Node 18+, no dependencies. To refresh the contracts: download IMPIC's yearly file from dados.gov.pt, unzip it, then `node tools/extract-base.mjs <ContratosYYYY.json> data/procurement/base-YYYY.json <resource-url> <date-read>`.

## How it works
- `dev` is the default branch. Every push to `dev` builds the site from `src/` and deploys it to GitHub Pages (`.github/workflows/pages.yml`), with the version at https://civic.promptugal.news/version.json.
- `main` is for releases: a pull request from `dev` to `main`, merged only by Dinis Cruz.
- No secrets in this repository. `.credentials/` and `.sg-send/` are ignored by git.

Made by the AgentiCCells site factory, request `requests/2026-11-17__civic-promptugal-news/` in AgentiCCells/AgentiCCells__Site__Factory.

## Licences
- Code: Apache-2.0, in `LICENSE`.
- Text, guidance and images: CC BY 4.0, in `LICENSE-TEXT`.
