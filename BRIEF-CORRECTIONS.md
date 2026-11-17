# BRIEF-CORRECTIONS.md

Where the brief proved wrong or could not be followed as written.

- **2026-11-17, base.gov.pt.** The brief names base.gov.pt for procurement. Its search answered our named, polite requests with a firewall alert, so we did not read it. The same contracts are published by IMPIC (who runs BASE) as open data on dados.gov.pt, and that is what the site reads. Each contract still links its record on base.gov.pt.
- **2026-11-17, agent name in commits.** The brief says to commit with `Agent: civic@PrompTugal.dinis`. This repository's gate (`scripts/check-commits.mjs`, from the AgentiCCells template) accepts only `role@AgentiCCells.person`, and a check is never weakened. Commits therefore carry `Agent: civic@AgentiCCells.dinis` plus `Role: civic@PrompTugal.dinis`, with the subject starting `civic@PrompTugal.dinis:`. For Dinis to settle.
- **2026-11-17, signing key.** Making the session key (`pki-agent.mjs keygen --session`) was refused by the session's permissions, so nothing is signed yet and `board/keys.json` lists the key as pending.
