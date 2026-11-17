// Copy what this site needs about the Algarve's 16 councils from PrompTugal__News__Website's
// data/by-place/<id>.json (public, signed by each place's agent) into data/places.json.
// Usage: node tools/import-places.mjs ../PrompTugal__News__Website
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const repo = process.argv[2] || '../PrompTugal__News__Website';
const IDS = ['albufeira', 'alcoutim', 'aljezur', 'castro-marim', 'faro', 'lagoa', 'lagos', 'loule', 'monchique', 'olhao', 'portimao', 'sao-bras-de-alportel', 'silves', 'tavira', 'vila-do-bispo', 'vila-real-de-santo-antonio'];
const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const list = JSON.parse(readFileSync(join(repo, 'data/by-place/places.json'), 'utf8')).places;
const places = IDS.map(id => {
  const d = JSON.parse(readFileSync(join(repo, `data/by-place/${id}.json`), 'utf8'));
  const p = list.find(x => x.id === id) || {};
  const council = (d.sources || []).find(s => s.kind === 'council');
  return { id, name: d.name, at: p.at || null, promptugal_page: `https://promptugal.news/${p.path || `algarve/${id}/`}`,
    council_site: council ? council.url : null, gaps: d.gaps || [], updated: d.updated, by: d.by };
});
writeFileSync('data/places.json', JSON.stringify({
  source: { repo: 'https://github.com/PrompTugal/PrompTugal__News__Website', path: 'data/by-place/<id>.json', commit, read_on: new Date().toISOString().slice(0, 10) },
  places }, null, 1) + '\n');
console.log(`${places.length} places from ${commit.slice(0, 7)}`);
