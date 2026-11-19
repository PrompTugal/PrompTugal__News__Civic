// ACC-015: every non-merge commit a push adds to dev must carry a readable Agent: trailer,
// read the way git reads it: git log --format=%(trailers:key=Agent,valueonly).
// Usage: node scripts/check-commits.mjs <before> <after>   (the pushed range, before..after)
// Only commits that are ancestors of the trusted base are skipped (security@'s control 8, 19 Nov 2026, Website fae9649db):
// a skip is never decided by what a tree holds or by a commit's own dates, so deleting this file, or merging in an old-dated
// history, skips nothing. The trusted base is pinned below by its full id. History is not rewritten (ACC-015).
// CI runs this file from the last release tag, never from the pushed tree (control 7 widened; .github/workflows/pages.yml).
// Prints OK or lists each commit that fails and exits 1.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
const lines = (s) => (s ? s.split('\n').filter(Boolean) : []);

const [beforeArg, afterArg] = process.argv.slice(2);
const after = afterArg || 'HEAD';
if (!tryGit('rev-parse', '--verify', '--quiet', `${after}^{commit}`)) { console.error(`check-commits: unknown commit ${after}`); process.exit(1); }

// The trusted base: the commit civic was seeded from (it holds the first copy of this check). A test may name another base
// in CHECK_COMMITS_TRUSTED_BASE, but never in CI, where a pushed workflow could set it (security@'s low finding).
const PINNED_BASE = 'e23a9a27d6eca3a958f369674b307fcee31e1033';
const override = process.env.CHECK_COMMITS_TRUSTED_BASE;
if (override && (process.env.CI || process.env.GITHUB_ACTIONS)) { console.error('check-commits: CHECK_COMMITS_TRUSTED_BASE is refused in CI'); process.exit(1); }
const BASE = override || PINNED_BASE;
if (!/^[0-9a-f]{40}$/.test(BASE) || tryGit('cat-file', '-t', BASE) !== 'commit') { console.error(`check-commits: the trusted base ${BASE.slice(0, 40)} is not a commit in this clone`); process.exit(1); }
// A shallow clone hides history, so an ancestor test could not be trusted (CI checks out with fetch-depth 0).
if (tryGit('rev-parse', '--is-shallow-repository') !== 'false') { console.error('check-commits: refused on a shallow clone'); process.exit(1); }
const isAncestorOfBase = c => { try { execFileSync('git', ['merge-base', '--is-ancestor', c, BASE], { stdio: 'ignore' }); return true; } catch { return false; } };

// A new branch, a forced push or a manual run has no usable "before": check everything since the check began.
const zero = /^0+$/;
const before = beforeArg && !zero.test(beforeArg) && tryGit('rev-parse', '--verify', '--quiet', `${beforeArg}^{commit}`);
const range = before ? [`${before}..${after}`] : [after];
const added = lines(git('rev-list', '--no-merges', ...range));

// A role may be dotted, role.speciality (Dinis, 16 Nov 2026: "we definitely should allow dots because that's our terminology").
// The estate's agents (Dinis, 18 Nov 2026, via conductor.b@PrompTugal.dinis, board/guidance/2026-11-18-five-sites-on-account-b.md
// in PrompTugal__News__Website: "In each of the five repos, the commit check accepts @PrompTugal.dinis agents"):
// role@AgentiCCells.person or role@PrompTugal.person, and nothing else.
const agentShape = /^[a-z0-9]+(?:[.-][a-z0-9]+)*@(?:agenticcells|promptugal)\.[a-z0-9][a-z0-9.-]*$/i;
// Exemptions (specialist.code@, 2026-11-16). CI checks from the last release tag, so one failing commit
// would block every later release, and history is never rewritten. A person may exempt that one commit in
// scripts/commit-exemptions.json: [{ "commit": "<full 40-hex sha>", "reason": "...", "approved_by": "Dinis Cruz",
// "date": "YYYY-MM-DD" }]. Each entry names exactly one commit; malformed entries fail the check.
const exempt = new Map();
const EX = 'scripts/commit-exemptions.json';
if (existsSync(EX)) {
  let list;
  try { list = JSON.parse(readFileSync(EX, 'utf8')); } catch (e) { console.error(`${EX}: not JSON (${e.message})`); process.exit(1); }
  if (!Array.isArray(list)) { console.error(`${EX}: must be a list`); process.exit(1); }
  for (const x of list) {
    if (!x || !/^[0-9a-f]{40}$/.test(x.commit || '') || !(x.reason || '').trim() || !(x.approved_by || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) {
      console.error(`${EX}: each entry needs a full 40-hex commit, a reason, approved_by and a date`); process.exit(1);
    }
    exempt.set(x.commit, x);
  }
}
const errors = [];
let checked = 0, exempted = 0;
for (const c of added) {
  if (isAncestorOfBase(c)) continue;
  if (exempt.has(c)) { exempted++; continue; }
  checked++;
  const agents = lines(git('log', '-1', '--format=%(trailers:key=Agent,valueonly)', c)).map((s) => s.trim());
  const subject = git('log', '-1', '--format=%s', c);
  if (!agents.length) errors.push(`${c.slice(0, 7)} ${subject}: no readable Agent: trailer (it must sit in the final trailer block)`);
  else if (!agents.every((a) => agentShape.test(a))) errors.push(`${c.slice(0, 7)} ${subject}: Agent: trailer is not role@agenticcells.person or role@promptugal.person (${agents.join(', ')})`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`FAILED (${errors.length} of ${checked} commits checked)`);
  process.exit(1);
}
console.log(`OK (${checked} commits checked, ${exempted} exempted, ${added.length - checked - exempted} before the trusted base skipped)`);
