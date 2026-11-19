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
  const temp = mkdtempSync(join(tmpdir(), 'civic-runner-temp-'));
  git('init', '-q', '-b', 'dev');
  const base = commit(`base${AGENT}`, { 'scripts/check-commits.mjs': CHECKER, 'scripts/leak-scan.mjs': "console.log('OK')\n" });
  const release = commit(`release${AGENT}`, { 'a.txt': '1' });
  git('tag', 'v0.1.0');
  return { d, git, env, base, release, commit, temp };
}
// CI: the trusted step with the anchor A and AFTER, then A's checker over the range it chose. (The anchor step itself reads
// GitHub's deployments API and cannot run here; each test hands the trusted step its A.)
function ci(r, A, after = r.git('rev-parse', 'HEAD'), extraEnv = {}) {
  r.git('checkout', '-q', '-f', after);
  const out = join(r.d, '.gh-output'); writeFileSync(out, '');
  const step = spawnSync('bash', ['-e', '-c', STEP], { cwd: r.d, env: { ...r.env, A, AFTER: after, GITHUB_OUTPUT: out, RUNNER_TEMP: r.temp }, encoding: 'utf8' });
  if (step.status !== 0) return { stage: 'step', status: step.status, text: step.stdout + step.stderr };
  const o = Object.fromEntries(readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  // as CI runs it: the absolute node the step found, A's checker from the temporary folder, the checkout as the working folder
  if (!o.node.startsWith('/') || !o.commits.startsWith(r.temp)) return { stage: 'step', status: 99, text: `node ${o.node} or checker ${o.commits} not as control 9 asks` };
  const p = spawnSync(o.node, [o.commits, o.from, after], { cwd: r.d, env: { ...r.env, CHECK_COMMITS_TRUSTED_BASE: r.base, ...extraEnv }, encoding: 'utf8' });
  return { stage: 'check', status: p.status, text: p.stdout + p.stderr, from: o.from, sha: o.sha };
}
const expect = (x, stage, re) => x.status !== 0 && x.stage === stage && re.test(x.text) ? true : `${x.stage} exit ${x.status}: ${x.text.slice(0, 300)}`;
function test(name, fn) {
  let r;
  try { r = repo(); const why = fn(r); results.push(why === true ? [name, true] : [name, false, why]); }
  catch (e) { results.push([name, false, String(e.message).slice(0, 300)]); }
  finally { if (r) { rmSync(r.d, { recursive: true, force: true }); rmSync(r.temp, { recursive: true, force: true }); } }
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
    const step = spawnSync('bash', ['-e', '-c', STEP], { cwd: s, env: { ...r.env, A: head, AFTER: head, GITHUB_OUTPUT: join(s, '.o'), RUNNER_TEMP: r.temp }, encoding: 'utf8' });
    const p = spawnSync('node', ['scripts/check-commits.mjs', '', 'HEAD'], { cwd: s, env: { ...r.env, CHECK_COMMITS_TRUSTED_BASE: head }, encoding: 'utf8' });
    return step.status !== 0 && /shallow checkout refused/.test(step.stderr) && p.status === 1 && /refused on a shallow clone/.test(p.stderr) ? true : `step ${step.status} ${step.stderr} | check ${p.status} ${p.stderr}`;
  } finally { rmSync(s, { recursive: true, force: true }); }
});
// Control 9: a symlink on a checker path is refused, not followed.
test('9: a symlink on a checker path is refused', r => {
  r.git('rm', '-q', 'scripts/leak-scan.mjs'); execFileSync('ln', ['-s', '/etc/hostname', join(r.d, 'scripts/leak-scan.mjs')]);
  r.commit(`symlink${AGENT}`);
  return expect(ci(r, r.release), 'step', /scripts\/leak-scan\.mjs is a symlink: refused/);
});
// Control 9: the checks job runs no pushed code and takes nothing from the build job but its built site, so a pushed
// build step that writes GITHUB_ENV or GITHUB_PATH (which act only within its own job) cannot change the result.
test('9: the checks job takes nothing from the build job but the built site, and runs no checkout script', () => {
  // comments are removed first, so no test can be satisfied by a comment (library.b@'s LIB-2026-067)
  const y = readFileSync('.github/workflows/pages.yml', 'utf8').split('\n').filter(l => !/^\s*#/.test(l)).join('\n'), at = y.indexOf('\n  checks:\n'), end = y.indexOf('\n  deploy:\n');
  if (at < 0 || end < at) return 'no checks job before deploy';
  const job = y.slice(at, end);
  if (/needs\.build\.outputs|\$\{\{\s*env\./.test(job)) return 'the checks job reads the build job\'s outputs or env';
  const runs = [...job.matchAll(/^\s+run: (.*)$/gm)].map(m => m[1]).filter(x => x !== '|');
  // each one-line run step must be exactly one of these (post-review: a prefix match let anything follow)
  const ALLOWED = new Set([`'"$NODE_BIN" "$CHECKER" "$FROM" "$AFTER"'`, `'"$NODE_BIN" "$LEAK" --root "$GITHUB_WORKSPACE"'`,
    `'bad=$(find _site ! -type f ! -type d -print -quit); if [ -n "$bad" ]; then echo "not a plain file or folder: $bad" >&2; exit 1; fi'`]);
  const odd = runs.filter(x => !ALLOWED.has(x.trim()));
  if (odd.length) return `a one-line run step outside the allowed ones: ${odd.join(' | ')}`;
  const vet = job.indexOf('name: Only plain files and folders in the built site');
  if (vet < 0 || vet > job.indexOf('- id: trusted')) return 'the built site is not vetted before the trusted copies are written';
  if (!/name: pages-checked-\$\{\{ github\.run_id \}\}/.test(job) || !/artifact_name: pages-checked-\$\{\{ github\.run_id \}\}/.test(y)) return 'the Pages artifact is not deployed by the checks job\'s own name';
  // the Pages artifact is made in this job, from the scanned bytes, after the leak scan; the build job makes none
  const build = y.slice(y.indexOf('\n  build:\n'), at);
  if (/upload-pages-artifact/.test(build)) return 'the build job uploads the Pages artifact';
  const up = job.indexOf('uses: actions/upload-pages-artifact'), scan = job.indexOf('"$NODE_BIN" "$LEAK"'), dl = job.indexOf('uses: actions/download-artifact'), tr = job.indexOf('- id: trusted');
  if (up < 0 || scan < 0 || up < scan) return 'the Pages artifact is not made in the checks job after the leak scan';
  if (dl < 0 || tr < 0 || dl > tr) return 'the built site is not downloaded before the trusted copies are written';
  if (/\bnode (scripts|tools)\//.test(job) || /\bnpm\b|\bnpx\b/.test(job)) return 'the checks job runs a script from the checkout';
  if (!/GIT_NO_REPLACE_OBJECTS: '1'/.test(job) || !/NODE_OPTIONS: ''/.test(job)) return 'replace objects or NODE_OPTIONS not cleared';
  if (!/\n  deploy:\n    needs: \[build, checks\]/.test(y)) return 'deploy does not wait for the checks job';
  // live.b@'s findings (a4c6fce): A counts only from a run whose job named checks passed; the security, deploy and tag jobs run only for dev
  if (!/select\(\.name == "checks" and \.conclusion == "success"/.test(job)) return 'the anchor does not require the run\'s checks job to have passed';
  if (!/\n  checks:\n    if: github\.ref == 'refs\/heads\/dev'\n/.test(y)) return 'the checks job is not limited to dev';
  if (!/\n  deploy:\n    needs: \[build, checks\]\n    if: github\.ref == 'refs\/heads\/dev' && /.test(y)) return 'the deploy job is not limited to dev';
  if (!/\n  tag:\n    needs: \[build, checks, deploy\]\n    if: \$\{\{ always\(\) && github\.ref == 'refs\/heads\/dev' && /.test(y)) return 'the tag job is not limited to dev';
  return true;
});
// The leak scan scans the repository --root names, so A's copy can run from the temporary folder.
test('9: the leak scan scans the folder --root names', r => {
  const copy = join(r.temp, 'leak-scan.mjs'); writeFileSync(copy, readFileSync('scripts/leak-scan.mjs'));
  const bad = spawnSync('node', [copy, '--root', r.temp], { encoding: 'utf8', env: r.env });
  const good = spawnSync('node', [copy, '--root', process.cwd()], { encoding: 'utf8', env: r.env });
  return bad.status === 1 && /is not a repository/.test(bad.stderr) && good.status === 0 && /^OK \(/.test(good.stdout) ? true : `bad ${bad.status} ${bad.stderr} | good ${good.status} ${good.stdout}${good.stderr}`;
});
// The leak scan reads a file with a NUL byte and refuses a symlink (library.b@'s LIB-2026-067).
test('9: the leak scan catches a secret in a binary file and refuses a symlink in the site', r => {
  const site = join(r.temp, 'repo'); mkdirSync(join(site, '_site'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: site });
  writeFileSync(join(site, '_site/index.html'), '<p>ok</p>');
  const copy = join(r.temp, 'leak-scan.mjs'); writeFileSync(copy, readFileSync('scripts/leak-scan.mjs'));
  const clean = spawnSync('node', [copy, '--root', site], { encoding: 'utf8', env: r.env });
  if (clean.status !== 0) return `a clean site should pass: ${clean.stdout}${clean.stderr}`;
  const key = ['-----BEGIN', 'OPENSSH PRIVATE KEY-----'].join(' ');
  writeFileSync(join(site, '_site/img.bin'), Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(`\n${key}\nAAAA\n`)]));
  const bin = spawnSync('node', [copy, '--root', site], { encoding: 'utf8', env: r.env });
  rmSync(join(site, '_site/img.bin'));
  execFileSync('ln', ['-s', '/etc/hostname', join(site, '_site/link')]);
  const link = spawnSync('node', [copy, '--root', site], { encoding: 'utf8', env: r.env });
  return bin.status === 1 && /img\.bin:\d+: private key block/.test(bin.stderr) && link.status === 1 && /_site\/link: a symlink/.test(link.stderr) ? true : `binary ${bin.status} ${bin.stderr} | link ${link.status} ${link.stderr}`;
});
// cyber.b@'s finding (4dd8500): every run step of the workflow parses as bash (a stray quote breaks a run)
test('every run step in the workflow is valid bash', () => {
  const L = readFileSync('.github/workflows/pages.yml', 'utf8').split('\n'), steps = [];
  for (let i = 0; i < L.length; i++) {
    const m = /^(\s*)(?:- )?run: (.*)$/.exec(L[i]); if (!m) continue;
    if (m[2] === '|') { const ind = m[1].length + 2, b = []; for (let j = i + 1; j < L.length; j++) { if (L[j].trim() && L[j].search(/\S/) < ind) break; b.push(L[j].slice(ind)); } steps.push([i + 1, b.join('\n')]); }
    else if (/^'.*'$/.test(m[2])) steps.push([i + 1, m[2].slice(1, -1).replace(/''/g, "'")]);
    else steps.push([i + 1, m[2]]);
  }
  if (steps.length < 8) return `only ${steps.length} run steps found`;
  const bad = steps.map(([n, src]) => [n, spawnSync('bash', ['-n', '-c', src], { encoding: 'utf8' })]).filter(([, p]) => p.status !== 0);
  return bad.length ? bad.map(([n, p]) => `line ${n}: ${p.stderr.trim()}`).join(' | ') : true;
});
// events.b@'s and videos.b@'s findings: attributes are off, and the git version check refuses what it cannot read
test('the trusted step turns attributes off and its git version check fails closed', r => {
  if (!/export GIT_ATTR_SOURCE=\$empty/.test(STEP) || !/core\.attributesFile \/dev\/null/.test(STEP) || /git show "\$A:/.test(STEP)) return 'attributes are not turned off, or a trusted file is read with git show';
  const check = STEP.split('\n').filter(l => /^\s*(v=\$\(git --version|if ! \[\[ \$ma|if \[ "\$ma" -lt 2 \])/.test(l)).join('\n');
  const fake = v => spawnSync('bash', ['-e', '-c', `git() { echo "${v}"; }\n${check}\necho passed`], { encoding: 'utf8' });
  const old = fake('git version 2.41.0'), odd = fake('git version x.y'), none = fake(''), ok = fake('git version 2.56.1');
  return /older than 2\.42/.test(old.stderr) && /unreadable/.test(odd.stderr) && /unreadable/.test(none.stderr) && /passed/.test(ok.stdout) ? true : `old ${old.stderr} | odd ${odd.stderr} | none ${none.stderr} | ok ${ok.stdout}${ok.stderr}`;
});
// Control 10 (security@'s ed70bd996): the workflow's own symlinks step, run in throw-away repositories.
const SYMSTEP = (() => {
  const L = readFileSync('.github/workflows/pages.yml', 'utf8').split('\n');
  const at = L.findIndex(l => l.trim() === '- id: symlinks'); if (at < 0) throw new Error('no symlinks step in pages.yml');
  const r = L.findIndex((l, i) => i > at && l.trim() === 'run: |'); const ind = L[r].indexOf('run') + 2;
  const out = []; for (let i = r + 1; i < L.length; i++) { if (L[i].trim() && L[i].search(/\S/) < ind) break; out.push(L[i].slice(ind)); }
  return out.join('\n');
})();
const sym = (r, A) => { const after = r.git('rev-parse', 'HEAD'); r.git('checkout', '-q', '-f', after);
  const p = spawnSync('bash', ['-e', '-c', SYMSTEP], { cwd: r.d, env: { ...r.env, A, AFTER: after }, encoding: 'utf8' }); return { status: p.status, text: p.stdout + p.stderr }; };
const link = (r, name, target = 'a.txt') => { mkdirSync(join(r.d, name, '..'), { recursive: true }); execFileSync('ln', ['-s', target, join(r.d, name)]); };
test('10: a pushed symlink fails', r => {
  link(r, 'docs/link'); r.commit(`a symlink${AGENT}`);
  const x = sym(r, r.release);
  return x.status !== 0 && /adds or changes a symlink: docs\/link/.test(x.text) && /checkout holds a symlink: docs\/link/.test(x.text) ? true : `exit ${x.status}: ${x.text}`;
});
test('10: a symlink listed in A\'s exceptions passes', r => {
  const a = r.commit(`exceptions${AGENT}`, { 'scripts/symlink-exceptions.json': JSON.stringify([{ path: 'docs/link', target: 'a.txt', reason: 'test: a listed link' }]) });
  link(r, 'docs/link'); r.commit(`the listed symlink${AGENT}`);
  const x = sym(r, a);
  return x.status === 0 && /no symlinks/.test(x.text) ? true : `exit ${x.status}: ${x.text}`;
});
test('10: a symlink listed only in the pushed tree fails', r => {
  r.commit(`exceptions pushed${AGENT}`, { 'scripts/symlink-exceptions.json': JSON.stringify([{ path: 'docs/link', target: 'a.txt', reason: 'pushed' }]) });
  link(r, 'docs/link'); r.commit(`the symlink${AGENT}`);
  const x = sym(r, r.release);
  return x.status !== 0 && /adds or changes a symlink: docs\/link/.test(x.text) ? true : `exit ${x.status}: ${x.text}`;
});
test('10: a symlink whose name holds a newline cannot pass on part of its name', r => {
  const a = r.commit(`exceptions${AGENT}`, { 'scripts/symlink-exceptions.json': JSON.stringify([{ path: 'evil', target: 'a.txt', reason: 'test' }, { path: 'x', target: 'a.txt', reason: 'test' }]) });
  link(r, 'evil\nx'); r.commit(`newline name${AGENT}`);
  const x = sym(r, a);
  return x.status !== 0 && /symlinks refused/.test(x.text) ? true : `exit ${x.status}: ${x.text}`;
});
test('10: a symlink deleted in the range does not fail, and an exception without a reason does not count', r => {
  link(r, 'old/link'); const a0 = r.commit(`old link${AGENT}`, { 'scripts/symlink-exceptions.json': JSON.stringify([{ path: 'old/link', target: 'a.txt', reason: 'test' }, { path: 'noreason', target: 'a.txt' }]) });
  r.git('rm', '-q', 'old/link'); r.commit(`remove it${AGENT}`);
  const ok = sym(r, a0);
  link(r, 'noreason'); r.commit(`unexplained${AGENT}`);
  const bad = sym(r, a0);
  return ok.status === 0 && bad.status !== 0 && /noreason/.test(bad.text) ? true : `ok ${ok.status} ${ok.text} | bad ${bad.status} ${bad.text}`;
});
// library.b@'s LIB-2026-069: a merge, AFTER's own tree, a re-pointed exception, a target with a trailing newline, a .git link.
test('10: a symlink added only in a merge fails', r => {
  const a = r.release; r.git('checkout', '-q', '-b', 'side'); r.commit(`side${AGENT}`, { 's.txt': '1' });
  r.git('checkout', '-q', '-'); r.commit(`main${AGENT}`, { 'm.txt': '1' });
  r.git('merge', '-q', '--no-commit', '--no-ff', 'side'); link(r, 'merged/link'); r.git('add', '-A'); r.git('commit', '-q', '-m', `merge${AGENT}`);
  const x = sym(r, a);
  return x.status !== 0 && /adds or changes a symlink: merged\/link/.test(x.text) ? true : `exit ${x.status}: ${x.text}`;
});
test('10: a symlink already in AFTER\'s tree before A fails', r => {
  link(r, 'early/link'); r.commit(`early link${AGENT}`); const a = r.commit(`later${AGENT}`, { 'l.txt': '1' });
  const x = sym(r, a);
  return x.status !== 0 && /AFTER's tree holds a symlink: early\/link/.test(x.text) ? true : `exit ${x.status}: ${x.text}`;
});
test('10: a listed link re-pointed elsewhere fails', r => {
  const a = r.commit(`exceptions${AGENT}`, { 'scripts/symlink-exceptions.json': JSON.stringify([{ path: 'docs/link', target: 'a.txt', reason: 'test' }]) });
  link(r, 'docs/link', '/etc/passwd'); r.commit(`re-pointed${AGENT}`);
  const x = sym(r, a);
  return x.status !== 0 && /adds or changes a symlink: docs\/link/.test(x.text) ? true : `exit ${x.status}: ${x.text}`;
});
test('10: a target with a trailing newline does not match the pinned one', r => {
  const a = r.commit(`exceptions${AGENT}`, { 'scripts/symlink-exceptions.json': JSON.stringify([{ path: 'docs/link', target: 'a.txt', reason: 'test' }]) });
  link(r, 'docs/link', 'a.txt\n'); r.commit(`newline target${AGENT}`);
  const x = sym(r, a);
  return x.status !== 0 && /symlinks refused/.test(x.text) ? true : `exit ${x.status}: ${x.text}`;
});
test('10: the step refuses a checkout whose .git is a symlink', () => {
  const blk = SYMSTEP.split('\n').filter(l => /\[ -L \.git \]/.test(l)).join('\n');
  const d = mkdtempSync(join(tmpdir(), 'gitlink-')); mkdirSync(join(d, 'real')); execFileSync('ln', ['-s', 'real', join(d, '.git')]);
  const p = spawnSync('bash', ['-c', `bad=0\n${blk}\necho "bad=$bad"`], { cwd: d, encoding: 'utf8' });
  return blk && /bad=1/.test(p.stdout) && /not a plain folder/.test(p.stderr) ? true : `block ${!!blk}: ${p.stdout}${p.stderr}`;
});
test('10: an exception whose reason is only spaces does not count, and a failing listing stops the step', r => {
  const a = r.commit(`exceptions${AGENT}`, { 'scripts/symlink-exceptions.json': JSON.stringify([{ path: 'docs/link', target: 'a.txt', reason: '   ' }]) });
  link(r, 'docs/link'); r.commit(`blank reason${AGENT}`);
  const blank = sym(r, a);
  const after = r.git('rev-parse', 'HEAD');
  const p = spawnSync('bash', ['-e', '-c', SYMSTEP], { cwd: r.d, env: { ...r.env, A: '0'.repeat(40), AFTER: after }, encoding: 'utf8' });
  return blank.status !== 0 && /docs\/link/.test(blank.text) && p.status !== 0 && !/no symlinks/.test(p.stdout) ? true : `blank ${blank.status} ${blank.text} | bad range ${p.status} ${p.stdout}${p.stderr}`;
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
