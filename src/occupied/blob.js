// Parser for the galaxy server's occupied-clusters blob (reference: spec 1.6).
// After decompression the blob ends with:
//   int32 clusterCount, then clusterCount * { int64 seedKey, float32 caps,
//   int32 engineerCount, int32 reserved }   (20 bytes per record)
// preceded by a header + top-ten records whose exact layout varies by game
// version. We therefore locate the cluster table heuristically: find an
// int32 N such that the table exactly fills the remaining bytes and the
// first records decode to plausible seedKeys.
//
// Positions are NOT in the blob (they only exist inside Unity), so records
// are merged onto an existing occupied dump by seedKey; unknown seedKeys are
// kept with NaN positions and surfaced as "unplaced" in the UI.

import { unpackSeedKey } from '../address.js';

const RECORD = 20;

async function tryDecompress(buf, format) {
  const ds = new DecompressionStream(format);
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decompressBlob(buf) {
  for (const format of ['gzip', 'deflate', 'deflate-raw']) {
    try {
      return await tryDecompress(buf, format);
    } catch {
      /* try next */
    }
  }
  return new Uint8Array(buf); // maybe it isn't compressed at all
}

function plausibleSeedKey(key) {
  if (key <= 0n || key >= 100000000000000000n) return false; // seed < 1e8 -> key < 1e17
  const d = unpackSeedKey(key);
  return d.starCount >= 1 && d.starCount <= 999 && d.resCode >= 1 && d.resCode <= 99;
}

export function findClusterTable(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.byteLength;
  const maxHeader = Math.min(len, 65536);
  for (let o = 0; o + 4 <= maxHeader; o += 4) {
    const n = dv.getInt32(o, true);
    if (n <= 0 || n > 10000000) continue;
    if (o + 4 + n * RECORD !== len) continue;
    // validate a few records
    const check = Math.min(n, 8);
    let ok = true;
    for (let i = 0; i < check; i++) {
      const key = dv.getBigInt64(o + 4 + i * RECORD, true);
      const caps = dv.getFloat32(o + 4 + i * RECORD + 8, true);
      if (!plausibleSeedKey(key) || !Number.isFinite(caps) || caps < 0) {
        ok = false;
        break;
      }
    }
    if (ok) return { offset: o + 4, count: n };
  }
  return null;
}

export async function parseBlob(arrayBuffer) {
  const bytes = await decompressBlob(arrayBuffer);
  const table = findClusterTable(bytes);
  if (!table) {
    throw new Error(
      'could not locate the cluster table in this blob — the format may have ' +
      'changed; please share the file so the parser can be adapted'
    );
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = new Array(table.count);
  for (let i = 0; i < table.count; i++) {
    const off = table.offset + i * RECORD;
    records[i] = {
      seedKey: dv.getBigInt64(off, true),
      caps: dv.getFloat32(off + 8, true),
      engineers: dv.getInt32(off + 12, true),
    };
  }
  return records;
}

// Merge fresh blob stats into an occupied dataset (from the plugin dump).
// Returns a NEW dataset object: stats updated for known seedKeys; unknown
// seedKeys appended with NaN positions (can't be placed without the game).
export function mergeBlobRecords(occupied, records) {
  const base = occupied || {
    seedKeys: [], decoded: [],
    x: new Float32Array(0), y: new Float32Array(0), z: new Float32Array(0),
    caps: new Float32Array(0), engineers: new Int32Array(0),
    count: 0, unplaced: 0,
  };
  const index = new Map(base.seedKeys.map((k, i) => [k.toString(), i]));
  const caps = Float32Array.from(base.caps);
  const engineers = Int32Array.from(base.engineers);
  const addKeys = [];
  for (const r of records) {
    const i = index.get(r.seedKey.toString());
    if (i !== undefined) {
      caps[i] = r.caps;
      engineers[i] = r.engineers;
    } else {
      addKeys.push(r);
    }
  }
  const n = base.count + addKeys.length;
  const grow = (old, Ctor, fill) => {
    const a = new Ctor(n);
    a.set(old);
    if (fill !== undefined) a.fill(fill, base.count);
    return a;
  };
  const out = {
    seedKeys: base.seedKeys.concat(addKeys.map((r) => r.seedKey)),
    decoded: base.decoded.concat(addKeys.map((r) => unpackSeedKey(r.seedKey))),
    x: grow(base.x, Float32Array, NaN),
    y: grow(base.y, Float32Array, NaN),
    z: grow(base.z, Float32Array, NaN),
    caps: grow(caps, Float32Array),
    engineers: grow(engineers, Int32Array),
    count: n,
    unplaced: base.unplaced + addKeys.length,
  };
  addKeys.forEach((r, j) => {
    out.caps[base.count + j] = r.caps;
    out.engineers[base.count + j] = r.engineers;
  });
  return out;
}
