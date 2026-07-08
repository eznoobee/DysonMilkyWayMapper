import { describe, it, expect } from 'vitest';
import { buildGrid } from '../src/match/grid.js';
import { matchTargets } from '../src/match/matcher.js';

// Dataset: 100x100 unit lattice of points, x/z in 0..99, alternating heights.
function makeLattice() {
  const count = 100 * 100;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const seeds = new Int32Array(count);
  let i = 0;
  for (let gz = 0; gz < 100; gz++) {
    for (let gx = 0; gx < 100; gx++) {
      x[i] = gx;
      z[i] = gz;
      y[i] = (gx + gz) % 2 === 0 ? 0 : 100; // half the points are "high"
      seeds[i] = i;
      i++;
    }
  }
  const grid = buildGrid(x, z, count);
  return { seeds, x, y, z, count, grid };
}

describe('matchTargets', () => {
  const ds = makeLattice();

  it('finds the exact nearest point', () => {
    const res = matchTargets(ds, { xs: [50.1], zs: [50.2] }, 900);
    expect(res.matchedCount).toBe(1);
    const i = res.pointIndex[0];
    expect(ds.x[i]).toBe(50);
    expect(ds.z[i]).toBe(50);
    expect(res.errXZ[0]).toBeCloseTo(Math.hypot(0.1, 50.2 - 50), 4);
  });

  it('respects the height filter', () => {
    // (51,50) has y=100 (odd sum); with yMax=15 the nearest flat point is 1 unit away
    const res = matchTargets(ds, { xs: [51], zs: [50] }, 15);
    const i = res.pointIndex[0];
    expect(Math.abs(ds.y[i])).toBeLessThanOrEqual(15);
    expect(res.errXZ[0]).toBeCloseTo(1, 5);
  });

  it('never assigns the same seed twice', () => {
    // 5 targets at the same spot -> 5 distinct points
    const xs = [30, 30, 30, 30, 30];
    const zs = [30, 30, 30, 30, 30];
    const res = matchTargets(ds, { xs, zs }, 900);
    expect(res.matchedCount).toBe(5);
    const set = new Set(Array.from(res.pointIndex));
    expect(set.size).toBe(5);
  });

  it('reports unmatched targets when nothing is eligible in range', () => {
    // Far outside the lattice (>600 units away)
    const res = matchTargets(ds, { xs: [5000], zs: [5000] }, 900);
    expect(res.matchedCount).toBe(0);
    expect(res.pointIndex[0]).toBe(-1);
    expect(res.unmatchedCount).toBe(1);
  });

  it('computes median and max error', () => {
    const res = matchTargets(ds, { xs: [10, 20.5], zs: [10, 20] }, 900);
    expect(res.medianErr).toBeCloseTo(0.25, 5); // (0 + 0.5)/2
    expect(res.maxErr).toBeCloseTo(0.5, 5);
  });
});
