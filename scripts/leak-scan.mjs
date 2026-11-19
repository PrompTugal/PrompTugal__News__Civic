// The leak scan. Must print OK before every commit and in the Pages workflow.
// Node built-ins only. Written by security@agenticcells.dinis, 2026-11-15.
// Site template version (factory@AgentiCCells.dinis, 2026-11-16): scans _site/ instead
// of site/, skips the vault's ciphertext under .sg_vault/bare/, fails on any tracked
// file from .sg_vault/local/, and fails if this checkout's own vault key or token
// appears anywhere (the last two from the site repositories made by sites@).
//
// Scans every file git knows about (tracked, plus untracked files that are not
// ignored, so a new file is caught before its first commit) and the built _site/.
// It looks for secret shapes and reports the file, the line and the kind of
// shape. It never prints the matched text: a finding is described, never quoted.
//
// Usage:
//   node scripts/leak-scan.mjs            scan the working tree and _site/
//   node scripts/leak-scan.mjs --history    scan every commit reachable in this
//                                         clone (git log -p --all); fetch more
//                                         history first in a shallow clone
//
// Public keys are allowed only in team/keys.json and team/keys/*.json, and only
// when those files hold no private part. Any change to the allowlist below must
// be narrow (one path, one kind) and say why.
import { readFileSync, existsSync, statSync, lstatSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// --root <dir> names the repository to scan, so CI can run a trusted copy of this file from outside the checkout
// (security@'s control 9, 19 Nov 2026); without it, the repository is the one this file sits in.
const rootArg = process.argv.indexOf('--root');
const root = rootArg > 0 ? resolve(process.argv[rootArg + 1] || '') : join(dirname(fileURLToPath(import.meta.url)), '..');
if (rootArg > 0 && !existsSync(join(root, '.git'))) { console.error(`leak-scan: --root ${root} is not a repository`); process.exit(1); }

// Built from parts so that this file does not match its own patterns.
const DASHES = '-'.repeat(5);
const PRIVATE_BLOCK = new RegExp(`${DASHES}BEGIN [A-Z0-9 ]*PRIVATE KEY( BLOCK)?${DASHES}`);
const PUBLIC_BLOCK = new RegExp(`${DASHES}BEGIN (?:RSA |EC )?PUBLIC KEY${DASHES}[\\s\\S]*?${DASHES}END (?:RSA |EC )?PUBLIC KEY${DASHES}`, 'g');
const PUBLIC_BEGIN = new RegExp(`${DASHES}BEGIN (?:RSA |EC |PGP )?PUBLIC KEY( BLOCK)?${DASHES}`);

// Exact shapes: [kind, regex]. Order matters only for the report.
const SHAPES = [
  ['private key block', PRIVATE_BLOCK],
  ['AWS access key id', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[0-9A-Z]{16}\b/],
  ['AWS secret access key assignment', /aws_?secret_?(?:access_?)?key\s*["']?\s*[:=]\s*["']?[A-Za-z0-9\/+]{40}(?![A-Za-z0-9\/+])/i],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{22,}/],
  ['sgit vault or read key', /\bsgit_(?:private_vault|private_read|vk1|rk1)_[A-Za-z0-9:]{8,}/],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['Google OAuth access token', /\bya29\.[A-Za-z0-9_-]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Anthropic or OpenAI API key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/],
];

// sgit vault key without its prefix: {passphrase}:{vault_id}. sgit generates a
// 24-character lowercase alphanumeric passphrase and an 8-character vault id.
// The passphrase side must mix letters and digits and not be pure hex, so that
// "sha256:<fingerprint>" and "<commit>:<path>" do not count.
const VAULT_PAIR = /(?<![A-Za-z0-9_\/.-])([a-z0-9]{16,64}):([a-z0-9]{4,24})(?![A-Za-z0-9_\/.-])/g;
function vaultPair(line) {
  for (const m of line.matchAll(VAULT_PAIR)) {
    const p = m[1];
    if (/[a-z]/.test(p) && /[0-9]/.test(p) && !/^[0-9a-f]+$/.test(p)) return true;
  }
  return false;
}

// A secret-looking value assigned to a secret-looking name.
const ASSIGN = /\b(?:pass(?:word|phrase)|secret|token|api_?key|private_?key|access_?key)\w*["']?\s*[:=]\s*["']?([A-Za-z0-9\/+_=.-]{16,})/gi;

function entropy(s) {
  const n = {};
  for (const c of s) n[c] = (n[c] || 0) + 1;
  let h = 0;
  for (const k in n) { const p = n[k] / s.length; h -= p * Math.log2(p); }
  return h;
}

// Long high-entropy strings. Pure hex of 40 characters is a git object id and
// is allowed (pinned actions, commit references); longer hex is flagged.
const LONG = /[A-Za-z0-9+\/_-]{32,}={0,2}/g;
function highEntropy(line) {
  for (const m of line.matchAll(LONG)) {
    const s = m[0].replace(/=+$/, '');
    if (/^[0-9a-f]+$/i.test(s)) { if (s.length >= 48 && entropy(s) >= 3.5) return true; continue; }
    if (s.includes('/') && !/[+=]/.test(m[0]) && s.split('/').some((seg) => /^[a-z][a-z.-]*$/.test(seg))) continue; // a path or URL
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((r) => r.test(s)).length;
    if (classes >= 3 && entropy(s) >= 4.3) return true;
  }
  return false;
}

// Narrow allowlist: [path, kind, reason]. Keep each entry to one file and one kind.
const ALLOW = [
  ['src/assets/obs/obs.json', 'long high-entropy string', "civic's observability config: four append-only lane tokens and the drain's public encryption key, public by design as on promptugal.news (Dinis, 18 Nov 2026, in civic.b@'s session: 'Those tokens are public by design'). A token can only append to its lane; the key can only encrypt. The vault key, enum key and drain private key are never here."],
  ['src/assets/obs/obs.json', 'public key outside team/keys', "civic's observability config: four append-only lane tokens and the drain's public encryption key, public by design as on promptugal.news (Dinis, 18 Nov 2026, in civic.b@'s session: 'Those tokens are public by design'). A token can only append to its lane; the key can only encrypt. The vault key, enum key and drain private key are never here."],
  ['_site/assets/obs/obs.json', 'long high-entropy string', 'the built copy of src/assets/obs/obs.json (same reason)'],
  ['_site/assets/obs/obs.json', 'public key outside team/keys', 'the built copy of src/assets/obs/obs.json (same reason)'],
];
const allowed = (path, kind) => ALLOW.some(([p, k]) => p === path && k === kind);

const PUBLIC_KEY_FILES = (p) => p === 'team/keys.json' || /^team\/keys\/[a-z0-9-]+\.json$/.test(p);
// security@'s ruling (Website 1acd10498, 19 Nov 2026): an OpenSSH one-line public key (ssh-ed25519, ssh-rsa, ecdsa, and
// their security-key forms) is allowed only in its published field: a "public_key" value in a public key file, or the
// signing check's own allowed-signers file. Anywhere else it is flagged (the entropy rule alone missed about 1 in 75).
const SSH_PUB = /(?:^|[^A-Za-z0-9@.-])(?:sk-)?(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521))(?:@openssh\.com)?\s+AAAA[0-9A-Za-z+\/]{20,}={0,3}/;
const SSH_PUB_FIELD = (p, line) => (PUBLIC_KEY_FILES(p) && /^\s*"public_key"\s*:\s*"/.test(line)) || p === 'team/allowed_signers';
// kinds that no allowlist entry may ever exempt (security@: a private key header fails everywhere)
const NEVER_EXEMPT = new Set(['private key block']);

// Returns a list of {line, kind} for one file's text. Never returns the match.
export function scanText(path, text) {
  const found = [];
  const add = (line, kind) => { if (NEVER_EXEMPT.has(kind) || !allowed(path, kind)) found.push({ line, kind }); };
  let body = text;
  if (PUBLIC_KEY_FILES(path)) {
    if (/private|passphrase|secret|seed/i.test(text)) add(0, 'public key file mentions a private part');
    // Blank the allowed public key blocks, keeping line numbers.
    body = text.replace(PUBLIC_BLOCK, (b) => b.replace(/[^\n]/g, ' '));
  }
  body.split('\n').forEach((line, i) => {
    const n = i + 1;
    for (const [kind, re] of SHAPES) if (re.test(line)) add(n, kind);
    if (PUBLIC_BEGIN.test(line)) add(n, 'public key outside team/keys');
    if (SSH_PUB.test(line) && !SSH_PUB_FIELD(path, line)) add(n, 'ssh public key outside its published field');
    if (vaultPair(line)) add(n, 'sgit vault key shape (passphrase:vault_id)');
    for (const m of line.matchAll(ASSIGN)) {
      const v = m[1];
      if (/[0-9]/.test(v) && /[A-Za-z]/.test(v) && entropy(v) >= 3.5) { add(n, 'secret-looking value assigned to a secret name'); break; }
    }
    if (highEntropy(line)) add(n, 'long high-entropy string');
  });
  return found;
}

function isBinary(buf) { return buf.subarray(0, 8000).includes(0); }

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    const st = lstatSync(p);   // a symlink is reported, never followed (library.b@'s LIB-2026-067, 19 Nov 2026)
    return st.isSymbolicLink() ? [p] : st.isDirectory() ? walk(p) : [p];
  });
}

function scanTree() {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root })
    .toString().split('\0').filter(Boolean);
  const siteDir = join(root, '_site');
  if (!existsSync(join(siteDir, 'index.html'))) return { errors: ['_site/ is not built: run node scripts/build.mjs first'], count: 0 };
  const paths = [...new Set([...files, ...walk(siteDir).map((p) => p.slice(root.length + 1))])];
  const errors = [];
  let count = 0, skipped = 0;
  // The vault's own secrets, when this checkout holds them, must appear nowhere.
  const secrets = [];
  for (const k of ['.sg_vault/local/vault_key', '.sg_vault/local/token']) {
    const f = join(root, k);
    if (existsSync(f)) { const v = readFileSync(f, 'utf8').trim(); secrets.push(v, v.split(':')[0]); }
  }
  for (const p of paths) {
    if (p.startsWith('.sg_vault/local/')) { errors.push(`${p}: a file from .sg_vault/local/ is in the tree (it holds vault keys)`); continue; }
    if (p.startsWith('.sg_vault/bare/')) { skipped++; continue; } // ciphertext, protected by the vault key
    const full = join(root, p);
    let st; try { st = lstatSync(full); } catch { continue; } // deleted in the working tree
    if (st.isSymbolicLink()) { errors.push(`${p}: a symlink (the scan never follows one)`); continue; }
    if (st.isDirectory()) continue;
    const buf = readFileSync(full);
    // A file with a NUL byte is still scanned, byte for byte (LIB-2026-067): a secret hidden in a binary is still a secret.
    const binary = isBinary(buf);
    if (binary) skipped++;
    count++;
    const t = buf.toString(binary ? 'latin1' : 'utf8');
    for (const f of scanText(p, t)) errors.push(`${p}:${f.line}: ${f.kind}`);
    for (const x of secrets) if (x && x.length >= 8 && t.includes(x)) errors.push(`${p}: holds this checkout's vault key or token`);
  }
  return { errors, count, skipped };
}

function scanHistory() {
  // Added lines only: a removed line was already caught when it was added.
  const log = execFileSync('git', ['log', '-p', '--all', '--no-color', '--no-ext-diff', '--format=commit %H'], { cwd: root, maxBuffer: 1 << 30 }).toString();
  const errors = [];
  let commit = '', file = '', commits = 0;
  const byFile = new Map(); // commit+file -> added lines
  const flush = () => {
    for (const [key, lines] of byFile) {
      const [c, f] = key.split('\t');
      const found = scanText(f, lines.join('\n'));
      for (const x of found) errors.push(`${c.slice(0, 7)} ${f}: ${x.kind}`);
    }
    byFile.clear();
  };
  for (const line of log.split('\n')) {
    if (line.startsWith('commit ')) { flush(); commit = line.slice(7); commits++; file = ''; continue; }
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : ''; continue; }
    if (file && line.startsWith('+')) {
      const k = `${commit}\t${file}`;
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push(line.slice(1));
    }
  }
  flush();
  return { errors: [...new Set(errors)], count: commits };
}

// Self-test, run before every scan (security@: give each rule a test). Every sample is built from parts at run time,
// so this file never holds the shapes it looks for. A rule that stops catching its sample fails the scan.
function selfTest() {
  const D = '-'.repeat(5), B64 = (n, c = 'Qx9') => ('AAAAC3Nza' + c.repeat(Math.ceil(n / c.length))).slice(0, n);
  const cases = [
    ['openssh private key header', 'notes.md', `${D}BEGIN OPENSSH PRIVATE KEY${D}`, 'private key block'],
    ['rsa private key header', 'a.txt', `${D}BEGIN RSA PRIVATE KEY${D}`, 'private key block'],
    ['ec private key header', 'a.txt', `${D}BEGIN EC PRIVATE KEY${D}`, 'private key block'],
    ['dsa private key header', 'a.txt', `${D}BEGIN DSA PRIVATE KEY${D}`, 'private key block'],
    ['encrypted private key header', 'a.txt', `${D}BEGIN ENCRYPTED PRIVATE KEY${D}`, 'private key block'],
    ['private key header in the keys file', 'team/keys.json', `${D}BEGIN OPENSSH PRIVATE KEY${D}`, 'private key block'],
    ['private key header in an allowlisted file', 'src/assets/obs/obs.json', `${D}BEGIN PRIVATE KEY${D}`, 'private key block'],
    ['ssh-ed25519 line in code', 'scripts/x.mjs', `const k = "ssh-${'ed'}25519 ${B64(68)}"`, 'ssh public key outside its published field'],
    ['ssh-rsa line in a status file', 'board/team/civic/status.json', `"note": "ssh-${'rsa'} ${B64(120)}"`, 'ssh public key outside its published field'],
    ['ecdsa nistp256 line in data', 'data/x.json', `ecdsa-sha2-${'nistp'}256 ${B64(140)}`, 'ssh public key outside its published field'],
    ['ecdsa nistp384 line in a page', 'src/x.html', `<p>ecdsa-sha2-${'nistp'}384 ${B64(180)}</p>`, 'ssh public key outside its published field'],
    ['ecdsa nistp521 line in notes', 'docs/x.md', `key: ecdsa-sha2-${'nistp'}521 ${B64(220)}`, 'ssh public key outside its published field'],
    ['sk-ecdsa security key line', 'scripts/x.mjs', `'${'sk'}-ecdsa-sha2-${'nistp'}256@openssh.com ${B64(160)}'`, 'ssh public key outside its published field'],
    ['sk-ssh-ed25519 security key line', 'board/x.md', `${'sk'}-ssh-${'ed'}25519@openssh.com ${B64(90)}`, 'ssh public key outside its published field'],
    ['ecdsa key in the keys file but not in public_key', 'team/keys.json', `  "note": "ecdsa-sha2-${'nistp'}256 ${B64(140)}"`, 'ssh public key outside its published field'],
    ['ssh key in the keys file but not in public_key', 'team/keys.json', `  "comment": "ssh-${'ed'}25519 ${B64(68)}"`, 'ssh public key outside its published field'],
  ];
  const allowedCases = [
    ['ssh key in its published field', 'team/keys.json', `    "public_key": "ssh-${'ed'}25519 ${B64(68)}"`, 'ssh public key outside its published field'],
    ['ecdsa key in its published field', 'team/keys.json', `    "public_key": "ecdsa-sha2-${'nistp'}256 ${B64(140)}"`, 'ssh public key outside its published field'],
    ['sk-ecdsa key in its published field', 'team/keys.json', `    "public_key": "${'sk'}-ecdsa-sha2-${'nistp'}256@openssh.com ${B64(160)}"`, 'ssh public key outside its published field'],
  ];
  const bad = [];
  for (const [name, path, text, kind] of cases) if (!scanText(path, text).some(f => f.kind === kind)) bad.push(`self-test: ${name}: not caught`);
  for (const [name, path, text, kind] of allowedCases) if (scanText(path, text).some(f => f.kind === kind)) bad.push(`self-test: ${name}: wrongly flagged`);
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const st = selfTest(); if (st.length) { console.error(st.join('\n')); console.error('FAILED: the leak scan\'s own rules do not hold'); process.exit(1); }
  const history = process.argv.includes('--history');
  const { errors, count, skipped } = history ? scanHistory() : scanTree();
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(`FAILED (${errors.length}) in ${count} ${history ? 'commits' : 'files'}`);
    process.exit(1);
  }
  console.log(history ? `OK (${count} commits)` : `OK (${count} files, ${skipped} of them binary, scanned byte for byte)`);
}
