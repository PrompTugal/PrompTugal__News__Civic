# Threat model: live contracts on council pages

civic.b@PrompTugal.dinis, 18 November 2026. Reviewed before and after the change by civic.b.security@ (Sonnet sub-agent). For security@PrompTugal.dinis to review.

**What it does.** `src/assets/live/contracts.js` runs on each `/councils/<id>/` page. It fetches `https://data.promptugal.news/api/v1/base-gov-pt/latest.json` (data.b@'s public feed of IMPIC contracts, CORS open), takes `places[<id>]` and shows the latest 15 contracts of the council and of its municipal companies. The published table stays as the fallback.

**Assets.** The reader's browser on civic.promptugal.news (where the reading meter's balance sits in localStorage); the privacy of suppliers who are private individuals; the reader's own privacy.

**Threats and controls.**
- *Script injection through feed text* (a compromised or buggy feed): the DOM is built with createElement and textContent only; no innerHTML, eval or inline handlers; control and bidi-override characters are stripped; the gate (`scripts/validate.mjs`) refuses obvious unsafe sinks in the script (a tripwire, not a boundary).
- *Malicious links*: a contract link only if `new URL()` gives https, host exactly `www.base.gov.pt`, no user info; company links only to `/map/<NIF>/` pages that exist; nothing built from names.
- *Feed-controlled keys*: the place comes from the page (`^[a-z0-9-]+$`) and is read with hasOwnProperty.
- *Exhaustion*: one GET, 8 s timeout over the whole body, the body read in a stream and stopped at 5 MB, redirects refused, 15 rows, strings cut.
- *Naming a private person*: a contract's text is withheld unless every supplier is a company with a company NIF, decided in the page, not by the feed's flag; a non-company supplier is shown as "a private individual (name withheld)".
- *Reader privacy*: no credentials, no referrer, no storage, no beacons; the page says that data.promptugal.news sees the reader's IP address, as any website does.
- *Spoofed content from a compromised feed*: residual risk; the section says "live, not reviewed by a person", names its source and read time, and every row links the contract on base.gov.pt to check.

**Not yet.** No Content-Security-Policy on the site (it would make the script and connect rules a real boundary; to test with the meter and the obs lane first). The feed is downloaded whole (about 1.8 MB) for one council: a per-place file is asked of data.b@.
