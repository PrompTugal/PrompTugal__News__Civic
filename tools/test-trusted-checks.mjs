// Tests for security@'s controls 7 and 8 on civic's commit check (civic.b@PrompTugal.dinis, 19 Nov 2026; fourth ruling,
// Website 948820a7e: the range is A..AFTER and the checker comes from A, the newest commit a passing run deployed).
// Each test builds a throw-away repository and runs the `trusted` step of .github/workflows/pages.yml itself (its shell
// block, read from the workflow file), then the commit check over the range that step chose, as CI does. Each asserts the
// outcome and its reason. Node built-ins, bash and git only.
// Run: node tools/test-trusted-checks.mjs   (prints OK or the failing tests, exit 1)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHECKER = readFileSync('scripts/check-commits.mjs', 'utf8');
// The trusted step's shell block, as CI runs it.
const STEP = (() => {
  const L = readFileSync('.github/workflows/pages.yml', 'utf8').split('\n');
  const at = L.findIndex(l => l.trim() === '- id: trusted'); if (at < 0) throw new Error('no trusted step in pages.yml');
  const r = L.findIndex((l, i) => i > at && l.trim() === 'run: |'); const ind = L[r].indexOf('run') + 2;
  const out = []; for (let i = r + 1; i < L.length; i++) { if (L[i].trim() && L[i].search(/\S/) < ind) break; out.push(L[i].slice(ind)); }
  return out.join('\n');
})();
const cleanEnv = () => { const e = { ...process.env }; for (const k of ['CI', 'GITHUB_ACTIONS', 'CHECK_COMMITS_TRUSTED_BASE', 'NODE_OPTIONS', 'GIT_DIR', 'GIT_WORK_TREE', 'GITHUB_OUTPUT']) delete e[k]; return e; };
const AGENT = '\n\nAgent: test.civic@PrompTugal.dinis';
const results = [];

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'civic-trusted-'));
  const env = { ...cleanEnv(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  const git = (...a) => execFileSync('git', a, { cwd: d, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (msg, files = {}, extra = {}) => { for (const [f, c] of Object.entries(files)) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), c); }
    git('add', '-A'); execFileSync('git', ['commit', '-q', '--allow-empty', '-m', msg], { cwd: d, env: { ...env, ...extra } }); return git('rev-parse', 'HEAD'); };
  git('init', '-q', '-b', 'dev');
  const base = commit(`base${AGENT}`, { 'scripts/check-commits.mjs': CHECKER, 'scripts/leak-scan.mjs': "console.log('OK')\n" });
  const release = commit(`release${AGENT}`, { 'a.txt': '1' });
  git('tag', 'v0.1.0');
  return { d, git, env, base, release, commit };
}
// CI: the trusted step with the anchor A and AFTER, then A's checker over the range it chose. (The anchor step itself reads
// GitHub's deployments API and cannot run here; each test hands the trusted step its A.)
function ci(r, A, after = r.git('rev-parse', 'HEAD'), extraEnv = {}) {
  r.git('checkout', '-q', '-f', after);
  const out = join(r.d, '.gh-output'); writeFileSync(out, '');
  const step = spawnSync('bash', ['-e', '-c', STEP], { cwd: r.d, env: { ...r.env, A, AFTER: after, GITHUB_OUTPUT: out }, encoding: 'utf8' });
  if (step.status !== 0) return { stage: 'step', status: step.status, text: step.stdout + step.stderr };
  const o = Object.fromEntries(readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => l.split('=')));
  const p = spawnSync('node', ['scripts/check-commits.mjs', o.from, after], { cwd: r.d, env: { ...r.env, CHECK_COMMITS_TRUSTED_BASE: r.base, ...extraEnv }, encoding: 'utf8' });
  return { stage: 'check', status: p.status, text: p.stdout + p.stderr, from: o.from, sha: o.sha };
}
const expect = (x, stage, re) => x.status !== 0 && x.stage === stage && re.test(x.text) ? true : `${x.stage} exit ${x.status}: ${x.text.slice(0, 300)}`;
function test(name, fn) {
  let r;
  try { r = repo(); const why = fn(r); results.push(why === true ? [name, true] : [name, false, why]); }
  catch (e) { results.push([name, false, String(e.message).slice(0, 300)]); }
  finally { if (r) rmSync(r.d, { recursive: true, force: true }); }
}

// Control 8: deleting the checker skips nothing.
test('8: a commit that removes the checker and adds an unsigned change fails', r => {
  r.git('rm', '-q', '-r', 'scripts'); r.commit('remove the checker, no trailer', { 'b.txt': '2' });
  return expect(ci(r, r.release), 'check', /no trailer: no readable Agent/);
});
// Control 8: a skip is never decided by a commit's own dates.
test('8: an old-dated, unsigned commit merged from an unrelated history fails', r => {
  r.git('checkout', '-q', '--orphan', 'old'); r.git('rm', '-q', '-r', '--cached', '.');
  r.commit('old, no trailer', { 'old.txt': 'x' }, { GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' });
  r.git('checkout', '-q', '-f', 'dev'); r.git('merge', '-q', '--allow-unrelated-histories', '--no-edit', '-m', `merge${AGENT}`, 'old');
  return expect(ci(r, r.release), 'check', /old, no trailer: no readable Agent/);
});
// The ruling's third test: a backdated orphan pushed on its own.
test('8: a backdated orphan pushed as the new head fails', r => {
  r.git('checkout', '-q', '--orphan', 'orphan'); r.git('rm', '-q', '-r', '--cached', '.');
  const o = r.commit(`orphan${AGENT}`, { 'scripts/check-commits.mjs': "console.log('OK')\n", 'scripts/leak-scan.mjs': '' }, { GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' });
  return expect(ci(r, r.release, o), 'step', /not an ancestor of AFTER/);
});
// Control 7: the checker is A's, not the pushed tree's.
test('7: a push that weakens the checker and adds an unsigned commit still fails', r => {
  r.commit(`weaken the checker${AGENT}`, { 'scripts/check-commits.mjs': "console.log('OK')\n" });
  r.commit('unsigned change', { 'c.txt': '3' });
  const pushed = spawnSync('node', ['scripts/check-commits.mjs', r.release, 'HEAD'], { cwd: r.d, env: r.env, encoding: 'utf8' });
  if (pushed.status !== 0) return 'the weakened checker should pass on its own, or the test proves nothing';
  return expect(ci(r, r.release), 'check', /unsigned change: no readable Agent/);
});
test('7: an anchor A with no copy of the checker fails closed', r => {
  r.git('rm', '-q', 'scripts/check-commits.mjs'); const a = r.commit(`drop the checker${AGENT}`);
  r.commit(`next${AGENT}`, { 'scripts/check-commits.mjs': CHECKER, 'd.txt': '4' });
  return expect(ci(r, a), 'step', /the anchor A has no copy of scripts\/check-commits\.mjs/);
});
test('7: an anchor A that is not an ancestor of AFTER (a force push) fails', r => {
  const a = r.commit(`deployed earlier${AGENT}`, { 'e.txt': '5' });
  r.git('reset', '-q', '--hard', r.release); r.commit(`rewritten${AGENT}`, { 'e.txt': '6' });
  return expect(ci(r, a), 'step', /not an ancestor of AFTER \(a force push/);
});
// The fourth ruling's third test: a missing A.
test('7: a missing anchor A (empty or zero) fails', r => {
  r.commit(`x${AGENT}`, { 'f.txt': '7' });
  const a = ci(r, '0000000000000000000000000000000000000000'), b = ci(r, '');
  return expect(a, 'step', /no anchor A/) === true && expect(b, 'step', /no anchor A/) === true ? true : `${a.text} | ${b.text}`;
});
// The fourth ruling's first test: an unsigned commit from a dropped run, between A and BEFORE (finding 3b).
test('3b: an unsigned commit from a dropped run (between A and BEFORE) fails', r => {
  r.commit('dropped run, no trailer', { 'g.txt': '8' });
  r.commit(`next push${AGENT}`, { 'h.txt': '9' });
  const x = ci(r, r.release);
  return x.from === r.release ? expect(x, 'check', /dropped run, no trailer: no readable Agent/) : `range began at ${x.from}, not A`;
});
// The fourth ruling's second test: a pushed tag on an unverified commit is not used.
test('7: a pushed release tag on an unverified commit is not used', r => {
  r.commit(`weaken the checker${AGENT}`, { 'scripts/check-commits.mjs': "console.log('OK')\n" });
  r.commit('unverified, no trailer', { 'l.txt': '13' }); r.git('tag', 'v0.1.9');
  r.commit(`after the tag${AGENT}`, { 'm.txt': '14' });
  const x = ci(r, r.release);
  return x.from === r.release ? expect(x, 'check', /unverified, no trailer: no readable Agent/) : `range began at ${x.from}, not A`;
});
// Low finding: the trusted base cannot be overridden in CI.
test('low: CHECK_COMMITS_TRUSTED_BASE is refused when CI or GITHUB_ACTIONS is set', r => {
  r.commit(`y${AGENT}`, { 'i.txt': '10' });
  for (const k of ['CI', 'GITHUB_ACTIONS']) { const x = ci(r, r.release, undefined, { [k]: 'true' }); const w = expect(x, 'check', /refused in CI/); if (w !== true) return `${k}: ${w}`; }
  return true;
});
// Control 6's shallow-checkout refusal, in the step and in the check.
test('6: a shallow clone is refused', r => {
  r.commit(`more${AGENT}`, { 'j.txt': '11' });
  const s = mkdtempSync(join(tmpdir(), 'civic-shallow-'));
  try {
    execFileSync('git', ['clone', '-q', '--depth', '1', '--no-local', `file://${r.d}`, s], { env: r.env, stdio: 'ignore' });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: s, encoding: 'utf8' }).trim();
    const step = spawnSync('bash', ['-e', '-c', STEP], { cwd: s, env: { ...r.env, A: head, AFTER: head, GITHUB_OUTPUT: join(s, '.o') }, encoding: 'utf8' });
    const p = spawnSync('node', ['scripts/check-commits.mjs', '', 'HEAD'], { cwd: s, env: { ...r.env, CHECK_COMMITS_TRUSTED_BASE: head }, encoding: 'utf8' });
    return step.status !== 0 && /shallow checkout refused/.test(step.stderr) && p.status === 1 && /refused on a shallow clone/.test(p.stderr) ? true : `step ${step.status} ${step.stderr} | check ${p.status} ${p.stderr}`;
  } finally { rmSync(s, { recursive: true, force: true }); }
});
// And the control: a clean push passes, with A's checker.
test('a signed push passes', r => {
  r.commit(`fine${AGENT}`, { 'k.txt': '12' });
  const x = ci(r, r.release);
  return x.status === 0 && x.sha === r.release && /^OK \(1 commits checked/.test(x.text) ? true : `${x.stage} exit ${x.status}: ${x.text}`;
});

for (const [n, ok, why] of results) console.log(`${ok ? 'pass' : 'FAIL'}  ${n}${ok ? '' : `\n      ${why}`}`);
const bad = results.filter(x => !x[1]);
if (bad.length) { console.error(`FAILED: ${bad.length} of ${results.length}`); process.exit(1); }
console.log(`OK (${results.length} tests)`);
