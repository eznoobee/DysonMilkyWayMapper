import { describe, it, expect } from 'vitest';
import {
  packSeedKey, suffixFor, fogDifficultyNumber, resCode, clusterString,
  seedKeyFor, MODE_COMBAT, MODE_PEACE, MODE_SANDBOX,
} from '../src/address.js';

describe('fogDifficultyNumber', () => {
  it('floors difficulty*10', () => {
    expect(fogDifficultyNumber(0)).toBe(0);
    expect(fogDifficultyNumber(0.1)).toBe(1);
    expect(fogDifficultyNumber(2.5)).toBe(25);
    expect(fogDifficultyNumber(9.9)).toBe(99);
  });
  it('bumps tiny non-zero difficulty to 1', () => {
    expect(fogDifficultyNumber(0.05)).toBe(0 + 1); // floor gives 0, diff>0.001 -> 1
    expect(fogDifficultyNumber(0.0005)).toBe(0);   // <=0.001 stays 0
  });
  it('caps at 99', () => {
    expect(fogDifficultyNumber(50)).toBe(99);
  });
});

describe('resCode', () => {
  it('multiplies by 10', () => {
    expect(resCode(0.1)).toBe(1);
    expect(resCode(1)).toBe(10);
    expect(resCode(1.5)).toBe(15);
    expect(resCode(8)).toBe(80);
  });
  it('infinite (>9.95) -> 99', () => {
    expect(resCode(Infinity)).toBe(99);
    expect(resCode(10)).toBe(99);
  });
});

describe('suffixFor', () => {
  it('peace -> 0, sandbox -> 999', () => {
    expect(suffixFor(MODE_PEACE)).toBe(0);
    expect(suffixFor(MODE_SANDBOX)).toBe(999);
  });
  it('combat -> 100 + fog number', () => {
    expect(suffixFor(MODE_COMBAT, 0)).toBe(100);
    expect(suffixFor(MODE_COMBAT, 3)).toBe(130);
    expect(suffixFor(MODE_COMBAT, 9.9)).toBe(199);
  });
});

describe('packSeedKey', () => {
  it('packs per GameDesc.seedKey64', () => {
    expect(packSeedKey(0, 64, 99, 100)).toBe(6499100n);
    expect(packSeedKey(556881, 64, 99, 100)).toBe(55688106499100n);
    expect(packSeedKey(99999999, 64, 99, 100)).toBe(9999999906499100n);
  });
  it('clamps starCount and resCode', () => {
    expect(packSeedKey(1, 1500, 200, 0)).toBe(BigInt(1) * 100000000n + 999n * 100000n + 99n * 1000n);
    expect(packSeedKey(1, 0, 0, 0)).toBe(100000000n + 100000n + 1000n);
  });
});

describe('clusterString', () => {
  const base = { starCount: 64, resourceMultiplier: Infinity, fogDifficulty: 0 };
  it('combat format {seed:08d}-{stars}-Z{res:02d}-{fog:02d}', () => {
    expect(clusterString(99881893, { ...base, starCount: 56, mode: MODE_COMBAT }))
      .toBe('99881893-56-Z99-00');
    expect(clusterString(556881, { ...base, mode: MODE_COMBAT }))
      .toBe('00556881-64-Z99-00');
    expect(clusterString(42, { starCount: 32, resourceMultiplier: 0.1, mode: MODE_COMBAT, fogDifficulty: 2.5 }))
      .toBe('00000042-32-Z01-25');
  });
  it('peace format ...-A{res:02d}', () => {
    expect(clusterString(1, { starCount: 40, resourceMultiplier: 1, mode: MODE_PEACE }))
      .toBe('00000001-40-A10');
  });
  it('sandbox format {seed:08d}-{stars}S{res:02d} (no dash before S)', () => {
    expect(clusterString(7, { starCount: 64, resourceMultiplier: 8, mode: MODE_SANDBOX }))
      .toBe('00000007-64S80');
  });
});

describe('seedKeyFor', () => {
  it('matches the dump plugin packing for the known dataset', () => {
    const settings = { starCount: 64, resourceMultiplier: Infinity, mode: MODE_COMBAT, fogDifficulty: 0 };
    expect(seedKeyFor(123, settings)).toBe(123n * 100000000n + 64n * 100000n + 99n * 1000n + 100n);
  });
});
