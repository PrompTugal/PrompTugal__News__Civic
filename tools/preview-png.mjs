// Render _site/preview.svg to src/preview.png (1200 x 630) for social cards, with the pre-installed Playwright.
// Run after a build: node tools/preview-png.mjs   (civic.b@PrompTugal.dinis, 18 Nov 2026)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = readFileSync('_site/preview.svg', 'utf8');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(`<!doctype html><html><body style="margin:0">${svg.replace(/^<\?xml[^>]*>/, '')}</body></html>`);
await p.screenshot({ path: 'src/preview.png', clip: { x: 0, y: 0, width: 1200, height: 630 } }); await b.close();
console.log('src/preview.png written');
