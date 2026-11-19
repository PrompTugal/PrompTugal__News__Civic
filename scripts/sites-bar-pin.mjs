// The sites bar 1.1.0's files, pinned by git blob id (the ids of the same files in PrompTugal__News__Website dev,
// assets/sites-bar/1.1.0/, as security@ post-reviewed them in 90dfdd3baf). One table, read by build.mjs (before it imports
// the renderer) and by validate.mjs. The sha256s are checked against the registry's bar.sha256 at build, not stored here:
// the leak scan flags hex longer than a git id. civic.b@PrompTugal.dinis, 19 Nov 2026. Never patch the vendored files.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const PIN = {
  'vendor/sites-bar/1.1.0/sites-bar-render.mjs': '5f021b7ad3de48ce0418245b47cf058555a38004',
  'src/assets/sites-bar/1.1.0/sites-bar.css': 'b1b0772e139a4e51ea6e71768552aee62e8bf24c',
  'src/assets/sites-bar/1.1.0/sites-bar.js': '0cdcc5cc84b19afb9fa5941e2f3b62b77d979a10',
  // the shared time-zone-to-country table 1.0.0 (dev@, Website repo assets/obs/tz-country.json; registry obs_tz)
  'vendor/obs/tz-country/1.0.0/tz-country.json': '38d261cc705d012017b7c0ad4dc35b244077acd6',
};
export const blobId = b => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
// the files that do not match their pin (an empty list when all do)
export const pinProblems = (root = '.') => Object.entries(PIN).filter(([f, id]) => { const p = `${root}/${f}`; return !existsSync(p) || blobId(readFileSync(p)) !== id; }).map(([f]) => f);
