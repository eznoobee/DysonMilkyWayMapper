// End-to-end smoke test with Playwright against the built single-file app.
// Prereqs: npm run build && node scripts/make-synthetic-dump.mjs 300000
// Usage:   node scripts/e2e.mjs
// Walks the acceptance checklist: load with progress, settings prefill,
// address preview, circle tool matching, uniqueness, export formats.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';

const CSV = 'testdata/mwdump_64_99_100_0-300000.csv';
const PORT = 4199;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

if (!existsSync('dist/index.html')) throw new Error('run npm run build first');
if (!existsSync(CSV)) throw new Error('run node scripts/make-synthetic-dump.mjs 300000 first');

const html = readFileSync('dist/index.html');
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
}).listen(PORT);

// PLAYWRIGHT_CHROMIUM lets CI/sandboxes point at a pre-installed browser.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
);
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (err) => check('no page errors', false, String(err)));

await page.goto(`http://localhost:${PORT}/`);

// --- load CSV with progress ---
await page.setInputFiles('#file-input', CSV);
await page.waitForFunction(
  () => document.getElementById('load-status').textContent.includes('stars'),
  null, { timeout: 60000 }
);
const status = await page.textContent('#load-status');
check('CSV loads and reports row count', status.includes('300,000'), status.trim());

// --- settings prefilled from filename ---
check('star count prefilled', await page.inputValue('#set-stars') === '64');
check('resources prefilled Infinite', await page.inputValue('#set-res') === 'Infinity');
const combatActive = await page.getAttribute('#set-mode button[data-mode="combat"]', 'class');
check('mode prefilled combat', (combatActive || '').includes('active'));
check('fog prefilled 0', parseFloat(await page.inputValue('#set-fog')) === 0);

// --- address preview format ---
const preview = await page.textContent('#address-preview');
check('address preview 12345678-64-Z99-00', preview === '12345678-64-Z99-00', preview);

// peace mode changes preview, then back to combat
await page.click('#set-mode button[data-mode="peace"]');
check('peace preview', await page.textContent('#address-preview') === '12345678-64-A99');
await page.click('#set-mode button[data-mode="sandbox"]');
check('sandbox preview', await page.textContent('#address-preview') === '12345678-64S99');
await page.click('#set-mode button[data-mode="combat"]');

// --- draw a default circle near the galactic center ---
await page.click('#tool-buttons button[data-tool="circle"]');
const canvas = await page.locator('#viewport canvas');
const box = await canvas.boundingBox();
await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2);
await page.waitForFunction(
  () => window.__mw.state.matches !== null, null, { timeout: 15000 }
);

const result = await page.evaluate(() => {
  const m = window.__mw.state.matches;
  const rows = window.__mw.buildRows();
  const seeds = rows.map((r) => r.seed);
  return {
    targets: window.__mw.state.targets.xs.length,
    matched: m.matchedCount,
    medianErr: m.medianErr,
    maxErr: m.maxErr,
    uniqueSeeds: new Set(seeds).size,
    rowCount: rows.length,
    firstRole: rows[0] && rows[0].role,
    addresses: window.__mw.addressText().split('\n'),
    csvHead: window.__mw.csvText().split('\n').slice(0, 2),
  };
});

check('circle places 41 targets (40 dots + center)', result.targets === 41, String(result.targets));
check('all 41 targets matched', result.matched === 41, String(result.matched));
check('median error < 5 units', result.medianErr < 5, result.medianErr.toFixed(2));
check('no seed used twice', result.uniqueSeeds === result.rowCount,
  `${result.uniqueSeeds}/${result.rowCount}`);
check('first role is center', result.firstRole === 'center', result.firstRole);
check('addresses match NNNNNNNN-64-Z99-00',
  result.addresses.every((a) => /^\d{8}-64-Z99-00$/.test(a)),
  result.addresses[0]);
check('csv header exact',
  result.csvHead[0] === 'role,seed,cluster_address,star_count,resources,mode,fog_difficulty,x,y,z,err_xz');
check('csv row shape',
  /^center,\d{8},\d{8}-64-Z99-00,64,infinite,combat\/dark fog,0,-?\d+\.\d{3},-?\d+\.\d{3},-?\d+\.\d{3},\d+\.\d{3}$/
    .test(result.csvHead[1]),
  result.csvHead[1]);

// --- changing a setting invalidates matches ---
await page.fill('#set-stars', '60');
await page.dispatchEvent('#set-stars', 'change');
const invalidated = await page.evaluate(() => window.__mw.state.matches === null);
check('settings change clears match results', invalidated);
const copyDisabled = await page.getAttribute('#btn-copy', 'disabled');
check('export disabled after invalidation', copyDisabled !== null);

// --- undo / clear ---
await page.click('#btn-undo');
const targetsAfterUndo = await page.evaluate(() => window.__mw.state.targets.xs.length);
check('undo removes the circle group', targetsAfterUndo === 0, String(targetsAfterUndo));

// --- occupied/lit stars: load, HUD count, decode, inspect tooltip ---
await page.setInputFiles('#file-input', 'testdata/mwoccupied_test.csv');
await page.waitForFunction(() => window.__mw.state.occupied !== null, null, { timeout: 15000 });
const occ = await page.evaluate(() => {
  const o = window.__mw.state.occupied;
  return {
    count: o.count,
    unplaced: o.unplaced,
    firstAddr: o.decoded[0].address,
    modes: [...new Set(o.decoded.map((d) => d.mode))].sort(),
  };
});
check('occupied CSV loads 1500 lit clusters', occ.count === 1500, String(occ.count));
check('lit clusters all placed', occ.unplaced === 0);
check('seedKey decodes to an address', /^\d{8}-\d+(-[AZ]|S)\d{2}(-\d{2})?$/.test(occ.firstAddr), occ.firstAddr);
check('mixed modes decoded', occ.modes.length >= 2, occ.modes.join(','));
const occStatus = await page.textContent('#occupied-status');
check('occupied status shows count', occStatus.includes('1,500'), occStatus.trim());

// hover a lit star: project one to screen coords and move the mouse there
await page.click('#tool-buttons button[data-tool="browse"]');
const litProbe = await page.evaluate(() => {
  // find a lit star reasonably far from the center to avoid overlaps
  const o = window.__mw.state.occupied;
  let best = 0, bestR = -1;
  for (let i = 0; i < o.count; i++) {
    const r = Math.hypot(o.x[i], o.z[i]);
    if (r > bestR) { bestR = r; best = i; }
  }
  return { i: best, addr: o.decoded[best].address };
});
// top-down first so projection is stable, then compute its screen position
await page.keyboard.press('t');
await page.waitForTimeout(800);
const screenPos = await page.evaluate((idx) => {
  const o = window.__mw.state.occupied;
  return window.__mw.projectForTest(o.x[idx], o.y[idx], o.z[idx]);
}, litProbe.i);
await page.mouse.move(screenPos.x, screenPos.y);
await page.waitForTimeout(200);
const tipVisible = await page.evaluate(() => !document.getElementById('tooltip').hidden);
const tipText = tipVisible ? await page.textContent('#tooltip') : '';
check('hover lit star shows tooltip', tipVisible);
check('tooltip decodes the address', tipText.includes(litProbe.addr),
  `${litProbe.addr} in "${tipText.slice(0, 80)}"`);
check('tooltip shows power + engineers', /power/.test(tipText) && /engineers/.test(tipText));

// view toggles: hide lit stars, tooltip should stop hitting them
await page.uncheck('#view-occupied');
await page.mouse.move(screenPos.x + 3, screenPos.y);
await page.waitForTimeout(150);
const tipAfterToggle = await page.evaluate(() => {
  const t = document.getElementById('tooltip');
  return t.hidden ? '' : t.textContent;
});
check('hiding lit stars disables their tooltip', !tipAfterToggle.includes('LIT'), tipAfterToggle.slice(0, 40));
await page.check('#view-occupied');
await page.click('#view-candidates button[data-mode="dim"]');
const dimApplied = await page.evaluate(() => window.__mw.state.view.candidates === 'dim');
check('candidates dim toggle', dimApplied);
await page.click('#view-candidates button[data-mode="bright"]');

// --- line tool: two clicks place N interpolated dots ---
await page.click('#tool-buttons button[data-tool="line"]');
await page.mouse.click(box.x + box.width / 2 - 200, box.y + box.height / 2 - 100);
await page.mouse.click(box.x + box.width / 2 + 200, box.y + box.height / 2 + 100);
const afterLine = await page.evaluate(() => window.__mw.state.targets.xs.length);
check('line places 12 dots', afterLine === 12, String(afterLine));

// --- point tool: one dot per click ---
await page.click('#tool-buttons button[data-tool="point"]');
await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2 + 150);
const afterPoint = await page.evaluate(() => ({
  n: window.__mw.state.targets.xs.length,
  lastRole: window.__mw.state.targets.roles.at(-1),
}));
check('point adds one target', afterPoint.n === 13, String(afterPoint.n));
check('point role pt_NN', /^pt_\d{2}$/.test(afterPoint.lastRole), afterPoint.lastRole);

// --- clear all ---
await page.click('#btn-clear');
const afterClear = await page.evaluate(() => window.__mw.state.targets.xs.length);
check('clear removes all targets', afterClear === 0, String(afterClear));

// --- screenshot for visual check ---
mkdirSync('testdata', { recursive: true });
await page.keyboard.press('t'); // top-down
await page.waitForTimeout(700);
await page.screenshot({ path: 'testdata/e2e-galaxy.png' });
console.log('screenshot: testdata/e2e-galaxy.png');

await browser.close();
server.close();
if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall e2e checks passed');
