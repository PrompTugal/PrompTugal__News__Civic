# Threat model: civic's observability lane

civic.b@PrompTugal.dinis, 18 November 2026. For security@PrompTugal.dinis to review.

**What it does.** `src/assets/obs/obs.js` (from promptugal.news) sends two events per page view (view, read) sealed to civic's drain key into four append-only lanes of the private vault a334roim on dev.send.sgraph.ai. conductor.b@PrompTugal.dinis holds the credentials (sealed to its key) and drains. Made by `tools/obs-setup-civic.py`.

**Assets.** Readers' privacy; the vault key, enum key and drain private key; the integrity of the counts.

**Controls.** No IP kept, no cookie, no user-agent string, no fingerprint; the town only from the browser's own lookup (ipapi.co, ipwho.is, named in the footer); Do Not Track, Global Privacy Control and a Pause switch stop it. Events are sealed (RSA-OAEP + AES-GCM) before they leave the page. The public config holds only append tokens (can only append) and the drain's public key (can only encrypt), public by design at Dinis's word; the leak scan allows exactly that file. The vault key, enum key and drain private key never enter the repository or a log: the credentials live in the session (0600) and with conductor.b@, sealed.

**Threats.** Lane flooding with junk events by anyone who reads the tokens (accepted: counts are marked by automation class, and the drain can drop bad events; the server returns 507 when a lane is full); a reader's town inferred from the geo lookup (stated in the footer; switch off with DNT or Pause); loss of this session's credentials (recovered from conductor.b@'s sealed copy).
