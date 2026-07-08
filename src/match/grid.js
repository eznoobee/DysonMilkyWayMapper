// CSR-style spatial hash over x/z. Typed arrays only:
//   cellStart[c]..cellStart[c+1] indexes into pointIdx for cell c.
// Cell size ~6 units ≈ 10x the median nearest-neighbor distance at 1M points.

export const CELL_SIZE = 6;

export function buildGrid(x, z, count, cellSize = CELL_SIZE) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const xi = x[i], zi = z[i];
    if (xi < minX) minX = xi;
    if (xi > maxX) maxX = xi;
    if (zi < minZ) minZ = zi;
    if (zi > maxZ) maxZ = zi;
  }
  const nx = Math.max(1, Math.floor((maxX - minX) / cellSize) + 1);
  const nz = Math.max(1, Math.floor((maxZ - minZ) / cellSize) + 1);
  const nCells = nx * nz;

  const cellOf = new Int32Array(count);
  const counts = new Int32Array(nCells + 1);
  for (let i = 0; i < count; i++) {
    const cx = Math.floor((x[i] - minX) / cellSize);
    const cz = Math.floor((z[i] - minZ) / cellSize);
    const c = cz * nx + cx;
    cellOf[i] = c;
    counts[c + 1]++;
  }
  for (let c = 0; c < nCells; c++) counts[c + 1] += counts[c];
  const cellStart = counts; // now prefix sums; cellStart[c]..cellStart[c+1]
  const cursor = cellStart.slice(0, nCells);
  const pointIdx = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    pointIdx[cursor[cellOf[i]]++] = i;
  }
  return { cellStart, pointIdx, minX, minZ, nx, nz, cellSize };
}
