// Stream the objects of a top-level JSON array, one by one (IMPIC's yearly files pass 512 MB, too long for one string).
// civic.b@PrompTugal.dinis, 19 Nov 2026 (moved out of tools/extract-base.mjs). Node built-ins only.
import { openSync, readSync, closeSync } from 'node:fs';
export function* objects(path) {
  const fd = openSync(path, 'r'); const buf = Buffer.alloc(1 << 24);
  let depth = 0, inStr = false, esc = false, start = -1, carry = [];
  for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0;) {
    let from = 0;
    for (let i = 0; i < n; i++) {
      const c = buf[i];
      if (inStr) { if (esc) esc = false; else if (c === 92) esc = true; else if (c === 34) inStr = false; continue; }
      if (c === 34) inStr = true;
      else if (c === 123) { if (++depth === 1) { start = i; from = i; carry = []; } }
      else if (c === 125) { if (--depth === 0) { carry.push(Buffer.from(buf.subarray(from, i + 1))); yield JSON.parse(Buffer.concat(carry).toString('utf8')); start = -1; } }
    }
    if (depth > 0 && start >= 0) { carry.push(Buffer.from(buf.subarray(from, n))); from = 0; }
  }
  closeSync(fd);
}
