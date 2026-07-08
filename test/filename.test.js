import { describe, it, expect } from 'vitest';
import { parseDumpFilename } from '../src/filename.js';
import { MODE_COMBAT, MODE_PEACE, MODE_SANDBOX } from '../src/address.js';

describe('parseDumpFilename', () => {
  it('parses the reference dataset name', () => {
    const p = parseDumpFilename('mwdump_64_99_100_0-1000000.csv');
    expect(p).toEqual({
      starCount: 64,
      resourceMultiplier: Infinity,
      mode: MODE_COMBAT,
      fogDifficulty: 0,
      seedStart: 0,
      seedEnd: 1000000,
    });
  });
  it('decodes combat fog difficulty from suffix', () => {
    const p = parseDumpFilename('mwdump_32_10_125_0-500.csv');
    expect(p.mode).toBe(MODE_COMBAT);
    expect(p.fogDifficulty).toBeCloseTo(2.5);
    expect(p.resourceMultiplier).toBe(1);
  });
  it('decodes peace and sandbox suffixes', () => {
    expect(parseDumpFilename('mwdump_48_5_0_0-100.csv').mode).toBe(MODE_PEACE);
    expect(parseDumpFilename('mwdump_48_5_999_0-100.csv').mode).toBe(MODE_SANDBOX);
  });
  it('returns null for other names', () => {
    expect(parseDumpFilename('stars.csv')).toBeNull();
    expect(parseDumpFilename('mwdump_64.csv')).toBeNull();
  });
});
