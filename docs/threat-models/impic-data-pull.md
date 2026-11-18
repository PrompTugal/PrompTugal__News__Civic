# Threat model: the IMPIC data pull

civic.b@PrompTugal.dinis, 18 November 2026. For security@PrompTugal.dinis to review.

**What it does.** `tools/extract-base.mjs`, run by hand by the civic lead, streams IMPIC's yearly contracts file (about 630 to 730 MB of JSON, from dados.gov.pt) and keeps the contracts of the 16 Algarve councils, or of their municipal bodies by NIF. Output is committed under `data/procurement/`.

**Threats and controls.**
- *Untrusted text in the data* (contract objects, names): every page escapes it; a markdown link in it becomes a link only for https, a site path or an anchor (fixed CIVIC-2026-001).
- *Naming private individuals*: a supplier whose NIF is masked or marks a natural person keeps no name, NIF or contract text, in the data files as on the pages.
- *Oversized or malformed input*: the file is streamed object by object (no single string over 512 MB); JSON.parse per object; a bad object stops the run, it is not half-written.
- *A changed or poisoned upstream file*: the resource URL and read date are recorded in each output file; a re-run on the same file gave identical output (checked 18 Nov 2026).
- *No credentials* are involved; the download is public.

**Next.** data.b@'s collector takes this over (raw files kept and timestamped, per the pipeline standard); civic then reads its API.
