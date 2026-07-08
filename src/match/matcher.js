// Nearest-neighbor matching of shape targets to dump points.
// Expanding-ring search over the spatial hash; |y| <= yMax filter;
// greedy in target order with a used-set so no seed serves two targets.

export const MAX_SEARCH_RADIUS = 600; // units; beyond this a target reports unmatched

// Returns the index of the nearest eligible point, or -1. dist2Out[0] = squared distance.
export function nearestEligible(grid, x, y, z, tx, tz, yMax, used, dist2Out) {
  const { cellStart, pointIdx, minX, minZ, nx, nz, cellSize } = grid;
  const cx = Math.floor((tx - minX) / cellSize);
  const cz = Math.floor((tz - minZ) / cellSize);
  const maxRing = Math.ceil(MAX_SEARCH_RADIUS / cellSize);

  let best = -1;
  let bestD2 = Infinity;

  for (let r = 0; r <= maxRing; r++) {
    // Any point in ring r is at least (r-1)*cellSize away; once the best hit
    // beats that bound no farther ring can improve it.
    if (best !== -1) {
      const minPossible = (r - 1) * cellSize;
      if (minPossible > 0 && minPossible * minPossible > bestD2) break;
    }
    const x0 = cx - r, x1 = cx + r, z0 = cz - r, z1 = cz + r;
    for (let gz = z0; gz <= z1; gz++) {
      if (gz < 0 || gz >= nz) continue;
      const edgeRow = gz === z0 || gz === z1;
      const step = edgeRow ? 1 : x1 - x0; // interior rows: only the two edge columns
      for (let gx = x0; gx <= x1; gx += Math.max(1, step)) {
        if (gx < 0 || gx >= nx) continue;
        const c = gz * nx + gx;
        const s = cellStart[c], e = cellStart[c + 1];
        for (let k = s; k < e; k++) {
          const i = pointIdx[k];
          if (used[i]) continue;
          const yi = y[i];
          if (yi > yMax || yi < -yMax) continue;
          const dx = x[i] - tx;
          const dz = z[i] - tz;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = i;
          }
        }
      }
    }
  }
  dist2Out[0] = bestD2;
  return best;
}

// dataset: { x, y, z, count, grid }; targets: { xs, zs }
// Returns { pointIndex:Int32Array (-1 unmatched), errXZ:Float64Array,
//           matchedCount, unmatchedCount, medianErr, maxErr }
export function matchTargets(dataset, targets, yMax) {
  const n = targets.xs.length;
  const pointIndex = new Int32Array(n).fill(-1);
  const errXZ = new Float64Array(n);
  const used = new Uint8Array(dataset.count);
  const d2 = new Float64Array(1);

  let matchedCount = 0;
  const errs = [];
  for (let t = 0; t < n; t++) {
    const i = nearestEligible(
      dataset.grid, dataset.x, dataset.y, dataset.z,
      targets.xs[t], targets.zs[t], yMax, used, d2
    );
    if (i >= 0) {
      used[i] = 1;
      pointIndex[t] = i;
      const err = Math.sqrt(d2[0]);
      errXZ[t] = err;
      errs.push(err);
      matchedCount++;
    }
  }
  errs.sort((a, b) => a - b);
  const medianErr = errs.length
    ? (errs.length % 2 ? errs[(errs.length - 1) / 2]
       : (errs[errs.length / 2 - 1] + errs[errs.length / 2]) / 2)
    : 0;
  const maxErr = errs.length ? errs[errs.length - 1] : 0;
  return { pointIndex, errXZ, matchedCount, unmatchedCount: n - matchedCount, medianErr, maxErr };
}
