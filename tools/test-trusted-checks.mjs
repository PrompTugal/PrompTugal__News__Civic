// Tests for security@'s controls 7 (widened) and 8 on civic's commit check (civic.b@PrompTugal.dinis, 19 Nov 2026).
// Each test builds a throw-away repository, runs scripts/check-commits.mjs the way CI does, and asserts the outcome and
// its reason. Node built-ins and git only. Run: node tools/test-trusted-checks.mjs   (prints OK or the failing tests, exit 1)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHECKER = readFileSync('scripts/check-commits.mjs', 'utf8');
const cleanEnv = () => { const e = { ...process.env }; for (const k of ['CI', 'GITHUB_ACTIONS', 'CHECK_COMMITS_TRUSTED_BASE', 'NODE_OPTIONS', 'GIT_DIR', 'GIT_WORK_TREE']) delete e[k]; return e; };
const AGENT = '\n\nAgent: test.civic@PrompTugal.dinis';
const results = [];

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'civic-trusted-'));
  const env = { ...cleanEnv(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  const git = (...a) => execFileSync('git', a, { cwd: d, env, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'dev');
  mkdirSync(join(d, 'scripts'));
  writeFileSync(join(d, 'scripts/check-commits.mjs'), CHECKER);
  git('add', '.'); git('commit', '-q', '-m', `base${AGENT}`);
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(d, 'a.txt'), '1'); git('add', '.'); git('commit', '-q', '-m', `release${AGENT}`);
  git('tag', 'v0.1.0');
  return { d, git, env, base };
}
// Run the check as CI does: the checker taken from the release tag, run in place, over tag..HEAD.
function runTrusted(r, extraEnv = {}) {
  r.git('show', 'v0.1.0:scripts/check-commits.mjs');   // fails the test if the tag lacks the checker
  mkdirSync(join(r.d, 'scripts'), { recursive: true });   // as CI does: the pushed tree may have removed the folder
  writeFileSync(join(r.d, 'scripts/check-commits.mjs'), r.git('show', 'v0.1.0:scripts/check-commits.mjs') + '\n');
  return spawnSync('node', ['scripts/check-commits.mjs', 'v0.1.0', 'HEAD'], { cwd: r.d, env: { ...r.env, CHECK_COMMITS_TRUSTED_BASE: r.base, ...extraEnv }, encoding: 'utf8' });
}
function test(name, fn) {
  let r;
  try { r = repo(); const why = fn(r); results.push(why === true ? [name, true] : [name, false, why]); }
  catch (e) { results.push([name, false, String(e.message).slice(0, 300)]); }
  finally { if (r) rmSync(r.d, { recursive: true, force: true }); }
}

// Control 8: deleting the checker skips nothing.
test('8: a commit that removes the checker and adds an unsigned change fails', r => {
  r.git('rm', '-q', 'scripts/check-commits.mjs'); writeFileSync(join(r.d, 'b.txt'), '2'); r.git('add', '.'); r.git('commit', '-q', '-m', 'remove the checker, no trailer');
  const p = runTrusted(r);
  return p.status === 1 && /no readable Agent: trailer/.test(p.stderr) ? true : `status ${p.status}: ${p.stdout}${p.stderr}`;
});
// Control 8: a skip is never decided by a commit's own dates.
test('8: an old-dated, unsigned commit merged from an unrelated history fails', r => {
  r.git('checkout', '-q', '--orphan', 'old'); r.git('rm', '-q', '-r', '--cached', '.');
  writeFileSync(join(r.d, 'old.txt'), 'x'); r.git('add', 'old.txt');
  execFileSync('git', ['commit', '-q', '-m', 'old, no trailer'], { cwd: r.d, env: { ...r.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' } });
  r.git('checkout', '-q', '-f', 'dev'); r.git('merge', '-q', '--allow-unrelated-histories', '--no-edit', '-m', `merge${AGENT}`, 'old');
  const p = runTrusted(r);
  return p.status === 1 && /old, no trailer: no readable Agent/.test(p.stderr) ? true : `status ${p.status}: ${p.stdout}${p.stderr}`;
});
// Control 7: a weakened checker in the pushed tree is not the one that runs.
test('7: a push that weakens the checker and adds an unsigned commit still fails', r => {
  writeFileSync(join(r.d, 'scripts/check-commits.mjs'), "console.log('OK')\n"); r.git('add', '.'); r.git('commit', '-q', '-m', `weaken the checker${AGENT}`);
  writeFileSync(join(r.d, 'c.txt'), '3'); r.git('add', '.'); r.git('commit', '-q', '-m', 'unsigned change');
  const pushed = spawnSync('node', ['scripts/check-commits.mjs', 'v0.1.0', 'HEAD'], { cwd: r.d, env: r.env, encoding: 'utf8' });
  if (pushed.status !== 0) return 'the weakened checker should pass on its own, or the test proves nothing';
  const p = runTrusted(r);
  return p.status === 1 && /unsigned change: no readable Agent/.test(p.stderr) ? true : `status ${p.status}: ${p.stdout}${p.stderr}`;
});
// Control 7: the trusted copy is missing: fail closed.
test('7: no checker at the release tag fails closed', r => {
  r.git('tag', '-d', 'v0.1.0'); r.git('rm', '-q', 'scripts/check-commits.mjs'); r.git('commit', '-q', '-m', `drop${AGENT}`); r.git('tag', 'v0.1.0');
  try { r.git('show', 'v0.1.0:scripts/check-commits.mjs'); return 'git show should fail'; } catch { return true; }
});
// Low finding: the trusted base cannot be overridden in CI.
test('low: CHECK_COMMITS_TRUSTED_BASE is refused when CI or GITHUB_ACTIONS is set', r => {
  for (const k of ['CI', 'GITHUB_ACTIONS']) { const p = runTrusted(r, { [k]: 'true' }); if (!(p.status === 1 && /refused in CI/.test(p.stderr))) return `${k}: status ${p.status}: ${p.stderr}`; }
  return true;
});
// Control 6's shallow-checkout refusal, applied to this check too.
test('6: a shallow clone is refused', r => {
  writeFileSync(join(r.d, 'd.txt'), '4'); r.git('add', '.'); r.git('commit', '-q', '-m', `more${AGENT}`);
  const s = mkdtempSync(join(tmpdir(), 'civic-shallow-'));
  try {
    execFileSync('git', ['clone', '-q', '--depth', '1', '--no-local', `file://${r.d}`, s], { env: r.env });
    // the base is the clone's own head, so it is present and only the shallow refusal can stop the check
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: s, encoding: 'utf8' }).trim();
    const p = spawnSync('node', ['scripts/check-commits.mjs', '', 'HEAD'], { cwd: s, env: { ...r.env, CHECK_COMMITS_TRUSTED_BASE: head }, encoding: 'utf8' });
    return p.status === 1 && /refused on a shallow clone/.test(p.stderr) ? true : `status ${p.status}: ${p.stdout}${p.stderr}`;
  } finally { rmSync(s, { recursive: true, force: true }); }
});
// And the control: a clean range passes.
test('a signed range passes', r => {
  writeFileSync(join(r.d, 'e.txt'), '5'); r.git('add', '.'); r.git('commit', '-q', '-m', `fine${AGENT}`);
  const p = runTrusted(r);
  return p.status === 0 && /^OK \(1 commits checked/.test(p.stdout) ? true : `status ${p.status}: ${p.stdout}${p.stderr}`;
});

const bad = results.filter(x => !x[1]);
for (const [n, ok, why] of results) console.log(`${ok ? 'pass' : 'FAIL'}  ${n}${ok ? '' : `\n      ${why}`}`);
if (bad.length) { console.error(`FAILED: ${bad.length} of ${results.length}`); process.exit(1); }
console.log(`OK (${results.length} tests)`);
