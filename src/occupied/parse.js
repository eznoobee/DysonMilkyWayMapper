// Parser for occupied-star dumps written by the MWDump plugin (F10):
//   header: seedkey,x,y,z,caps,engineers
// Rows are the game's already-positioned lit clusters. Files are small
// (thousands of rows), so plain main-thread parsing is fine.

import { unpackSeedKey } from '../address.js';

export function parseOccupiedCsv(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length || !/^seedkey\s*,/i.test(lines[0])) {
    throw new Error('expected header "seedkey,x,y,z,caps,engineers"');
  }
  const n = lines.length;
  const seedKeys = [];
  const decoded = [];
  const xs = [], ys = [], zs = [], capsA = [], engA = [];

  for (let i = 1; i < n; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const p = line.split(',');
    if (p.length < 6) continue;
    let key;
    try {
      key = BigInt(p[0]);
    } catch {
      continue;
    }
    seedKeys.push(key);
    decoded.push(unpackSeedKey(key));
    xs.push(parseFloat(p[1]));
    ys.push(parseFloat(p[2]));
    zs.push(parseFloat(p[3]));
    capsA.push(parseFloat(p[4]) || 0);
    engA.push(parseInt(p[5], 10) || 0);
  }

  return {
    seedKeys,
    decoded,
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    z: Float32Array.from(zs),
    caps: Float32Array.from(capsA),
    engineers: Int32Array.from(engA),
    count: seedKeys.length,
    unplaced: 0, // rows without positions (only possible after a blob merge)
  };
}
