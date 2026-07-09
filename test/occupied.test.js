import { describe, it, expect } from 'vitest';
import { unpackSeedKey, packSeedKey, suffixFor, resCode, MODE_COMBAT, MODE_PEACE, MODE_SANDBOX } from '../src/address.js';
import { parseOccupiedCsv } from '../src/occupied/parse.js';
import { findClusterTable, mergeBlobRecords } from '../src/occupied/blob.js';

describe('unpackSeedKey', () => {
  it('round-trips packSeedKey for all modes', () => {
    const cases = [
      { seed: 99881893, starCount: 56, mult: Infinity, mode: MODE_COMBAT, fog: 0 },
      { seed: 556881, starCount: 64, mult: Infinity, mode: MODE_COMBAT, fog: 3 },
      { seed: 42, starCount: 32, mult: 0.1, mode: MODE_PEACE, fog: 0 },
      { seed: 7, starCount: 40, mult: 8, mode: MODE_SANDBOX, fog: 0 },
      { seed: 0, starCount: 64, mult: 1.5, mode: MODE_COMBAT, fog: 9.9 },
    ];
    for (const c of cases) {
      const key = packSeedKey(c.seed, c.starCount, resCode(c.mult), suffixFor(c.mode, c.fog));
      const d = unpackSeedKey(key);
      expect(d.seed).toBe(c.seed);
      expect(d.starCount).toBe(c.starCount);
      expect(d.resourceMultiplier).toBe(c.mult);
      expect(d.mode).toBe(c.mode);
      expect(d.fogDifficulty).toBeCloseTo(c.fog, 6);
    }
  });
  it('decodes the reference dataset seedKey to its address', () => {
    const d = unpackSeedKey(55688106499100n); // seed 556881, 64 stars, inf, combat fog 0
    expect(d.address).toBe('00556881-64-Z99-00');
  });
});

describe('parseOccupiedCsv', () => {
  it('parses plugin F10 dumps', () => {
    const csv = 'seedkey,x,y,z,caps,engineers\r\n'
      + '55688106499100,616.626,-8.593,592.93,1250000,3\r\n'
      + '12306432010999,-10.5,2.0,3.25,0,1\r\n';
    const o = parseOccupiedCsv(csv);
    expect(o.count).toBe(2);
    expect(o.decoded[0].address).toBe('00556881-64-Z99-00');
    expect(o.decoded[1].mode).toBe(MODE_SANDBOX);
    expect(o.x[0]).toBeCloseTo(616.626, 3);
    expect(o.engineers[0]).toBe(3);
    expect(o.unplaced).toBe(0);
  });
  it('rejects wrong headers', () => {
    expect(() => parseOccupiedCsv('seed,x,y,z\r\n1,2,3,4\r\n')).toThrow();
  });
});

function buildBlob(headerBytes, records) {
  const buf = new ArrayBuffer(headerBytes + 4 + records.length * 20);
  const dv = new DataView(buf);
  dv.setInt32(headerBytes, records.length, true);
  records.forEach((r, i) => {
    const off = headerBytes + 4 + i * 20;
    dv.setBigInt64(off, r.seedKey, true);
    dv.setFloat32(off + 8, r.caps, true);
    dv.setInt32(off + 12, r.engineers, true);
    dv.setInt32(off + 16, 0, true);
  });
  return new Uint8Array(buf);
}

describe('findClusterTable / mergeBlobRecords', () => {
  const records = [
    { seedKey: 55688106499100n, caps: 5e5, engineers: 2 },
    { seedKey: 12306432010999n, caps: 2e4, engineers: 1 },
  ];

  it('locates the cluster table behind an arbitrary header', () => {
    const bytes = buildBlob(36, records);
    const t = findClusterTable(bytes);
    expect(t).not.toBeNull();
    expect(t.count).toBe(2);
    expect(t.offset).toBe(40);
  });

  it('merges stats into an existing dump and appends unknown keys as unplaced', () => {
    const base = parseOccupiedCsv(
      'seedkey,x,y,z,caps,engineers\r\n55688106499100,1,2,3,100,1\r\n'
    );
    const merged = mergeBlobRecords(base, [
      { seedKey: 55688106499100n, caps: 999, engineers: 5 }, // update
      { seedKey: 12306432010999n, caps: 50, engineers: 1 },  // new, no position
    ]);
    expect(merged.count).toBe(2);
    expect(merged.caps[0]).toBe(999);
    expect(merged.engineers[0]).toBe(5);
    expect(Number.isNaN(merged.x[1])).toBe(true);
    expect(merged.unplaced).toBe(1);
    // base untouched
    expect(base.caps[0]).toBe(100);
  });
});
