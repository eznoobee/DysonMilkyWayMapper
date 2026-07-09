// Generates a synthetic spiral-galaxy dump CSV for testing the app without
// the real in-game dump. Approximates the measured properties of the real
// Milky Way data: 4 arms + bulge, radius ~1400, flat disk (median |y| ~50)
// plus a sparse halo. Deterministic (mulberry32).
//
// Usage: node scripts/make-synthetic-dump.mjs [rows] [outDir]
// Writes {outDir}/mwdump_64_99_100_0-{rows}.csv

import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const rows = parseInt(process.argv[2] || '300000', 10);
const outDir = process.argv[3] || 'testdata';
mkdirSync(outDir, { recursive: true });
const path = join(outDir, `mwdump_64_99_100_0-${rows}.csv`);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(898);
const gauss = () => {
  // Box-Muller
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

const ARMS = 4;
const ws = createWriteStream(path);
ws.write('seed,x,y,z\r\n');

let buf = '';
for (let seed = 0; seed < rows; seed++) {
  const kind = rand();
  let x, y, z;
  if (kind < 0.18) {
    // central bulge
    const r = Math.abs(gauss()) * 180;
    const a = rand() * Math.PI * 2;
    x = Math.cos(a) * r;
    z = Math.sin(a) * r;
    y = gauss() * 90;
  } else if (kind < 0.93) {
    // spiral arms: logarithmic spiral with scatter
    const t = Math.pow(rand(), 0.65); // denser toward center
    const r = 120 + t * 1350;
    const arm = (seed % ARMS) / ARMS;
    const theta = arm * Math.PI * 2 + Math.log(r / 120) * 2.4 + gauss() * 0.12;
    x = Math.cos(theta) * r + gauss() * 28;
    z = Math.sin(theta) * r + gauss() * 28;
    y = gauss() * 55;
  } else {
    // halo
    const r = 200 + rand() * 1500;
    const a = rand() * Math.PI * 2;
    x = Math.cos(a) * r;
    z = Math.sin(a) * r;
    y = gauss() * 320;
  }
  buf += `${seed},${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}\r\n`;
  if (buf.length > 1 << 20) {
    ws.write(buf);
    buf = '';
  }
}
ws.write(buf);
ws.end(() => console.log(`wrote ${path} (${rows} rows)`));

// --- synthetic occupied/lit clusters: a sample of positions with mixed
// settings seedKeys and log-normal power, mimicking a plugin F10 dump ---
const occPath = join(outDir, 'mwoccupied_test.csv');
const occRand = mulberry32(42);
const occGauss = () => {
  const u = Math.max(occRand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * occRand());
};
const suffixes = [100, 100, 100, 130, 0, 999]; // mostly combat fog 0
let occ = 'seedkey,x,y,z,caps,engineers\r\n';
const occCount = Math.min(1500, Math.floor(rows / 200));
for (let i = 0; i < occCount; i++) {
  // reuse a dump row's position so lit stars sit inside the galaxy
  const seed = Math.floor(occRand() * rows);
  const t = Math.pow(occRand(), 0.65);
  const r = 120 + t * 1350;
  const arm = (seed % ARMS) / ARMS;
  const theta = arm * Math.PI * 2 + Math.log(r / 120) * 2.4 + occGauss() * 0.12;
  const x = Math.cos(theta) * r + occGauss() * 28;
  const z = Math.sin(theta) * r + occGauss() * 28;
  const y = occGauss() * 55;
  const stars = 32 + Math.floor(occRand() * 33);
  const res = [1, 5, 10, 15, 99][Math.floor(occRand() * 5)];
  const suffix = suffixes[Math.floor(occRand() * suffixes.length)];
  const seedKey = BigInt(seed) * 100000000n + BigInt(stars) * 100000n + BigInt(res) * 1000n + BigInt(suffix);
  const caps = Math.exp(occGauss() * 2 + 12); // log-normal power
  const eng = 1 + Math.floor(Math.pow(occRand(), 3) * 20);
  occ += `${seedKey},${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)},${caps.toFixed(1)},${eng}\r\n`;
}
writeFileSync(occPath, occ);
console.log(`wrote ${occPath} (${occCount} lit clusters)`);
