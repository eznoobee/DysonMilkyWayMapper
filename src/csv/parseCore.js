// Core CSV parsing shared by the worker and the main-thread fallback.
// Header "seed,x,y,z", one row per line, CRLF or LF. Parses straight into
// growable typed arrays — no per-row JS objects, designed for 10M+ rows.

export function makeGrowable() {
  return {
    seeds: new Int32Array(1 << 20),
    x: new Float32Array(1 << 20),
    y: new Float32Array(1 << 20),
    z: new Float32Array(1 << 20),
    count: 0,
    ensure(n) {
      if (n <= this.seeds.length) return;
      let cap = this.seeds.length;
      while (cap < n) cap *= 2;
      const grow = (old, Ctor) => {
        const a = new Ctor(cap);
        a.set(old);
        return a;
      };
      this.seeds = grow(this.seeds, Int32Array);
      this.x = grow(this.x, Float32Array);
      this.y = grow(this.y, Float32Array);
      this.z = grow(this.z, Float32Array);
    },
  };
}

// Parse a float starting at s[i]; returns value, leaves end index in lastEnd.
// Handles sign, decimals and exponents (the dump uses ToString("R")).
let lastEnd = 0;
function parseNumber(s, i, len) {
  let c = s.charCodeAt(i);
  let neg = false;
  if (c === 45 /* - */) { neg = true; i++; c = s.charCodeAt(i); }
  let mant = 0;
  while (i < len && c >= 48 && c <= 57) {
    mant = mant * 10 + (c - 48);
    i++;
    c = s.charCodeAt(i);
  }
  if (c === 46 /* . */) {
    i++;
    c = s.charCodeAt(i);
    let frac = 0, scale = 1;
    while (i < len && c >= 48 && c <= 57) {
      frac = frac * 10 + (c - 48);
      scale *= 10;
      i++;
      c = s.charCodeAt(i);
    }
    mant += frac / scale;
  }
  if (c === 101 || c === 69 /* e E */) {
    i++;
    c = s.charCodeAt(i);
    let eneg = false;
    if (c === 45) { eneg = true; i++; c = s.charCodeAt(i); }
    else if (c === 43) { i++; c = s.charCodeAt(i); }
    let exp = 0;
    while (i < len && c >= 48 && c <= 57) {
      exp = exp * 10 + (c - 48);
      i++;
      c = s.charCodeAt(i);
    }
    mant *= Math.pow(10, eneg ? -exp : exp);
  }
  lastEnd = i;
  return neg ? -mant : mant;
}

// Parse complete lines in `text`; returns index just past the last parsed line.
export function parseChunk(text, data, isFirstChunk) {
  const len = text.length;
  let i = 0;
  if (isFirstChunk) {
    // skip header line
    const nl = text.indexOf('\n');
    if (nl === -1) return 0;
    i = nl + 1;
  }
  while (i < len) {
    const eol = text.indexOf('\n', i);
    if (eol === -1) return i; // partial line, carry to next chunk
    let c = text.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      const n = data.count;
      data.ensure(n + 1);
      // seed (non-negative int)
      let seed = 0;
      while (c >= 48 && c <= 57) {
        seed = seed * 10 + (c - 48);
        i++;
        c = text.charCodeAt(i);
      }
      if (c === 44 /* , */) {
        const xv = parseNumber(text, i + 1, eol);
        i = lastEnd;
        if (text.charCodeAt(i) === 44) {
          const yv = parseNumber(text, i + 1, eol);
          i = lastEnd;
          if (text.charCodeAt(i) === 44) {
            const zv = parseNumber(text, i + 1, eol);
            data.seeds[n] = seed;
            data.x[n] = xv;
            data.y[n] = yv;
            data.z[n] = zv;
            data.count = n + 1;
          }
        }
      }
    }
    i = eol + 1;
  }
  return i;
}

// Full streaming parse of a File/Blob. onProgress(bytes, totalBytes, rows) is
// called every ~4 MB. The awaits between chunks keep the caller's event loop
// live, so this is safe to run on the main thread as a worker fallback.
export async function parseFile(file, onProgress) {
  const totalBytes = file.size;
  const decoder = new TextDecoder();
  const data = makeGrowable();
  const reader = file.stream().getReader();

  let carry = '';
  let first = true;
  let bytesRead = 0;
  let lastReport = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    const text = carry + decoder.decode(value, { stream: true });
    const consumed = parseChunk(text, data, first);
    if (first && consumed > 0) first = false;
    carry = text.slice(consumed);
    if (onProgress && bytesRead - lastReport > 4 * 1024 * 1024) {
      lastReport = bytesRead;
      onProgress(bytesRead, totalBytes, data.count);
    }
  }
  // flush any final partial line (file may lack trailing newline)
  const tail = carry + decoder.decode();
  if (tail.length) parseChunk(tail + '\n', data, first);

  const n = data.count;
  return {
    seeds: data.seeds.slice(0, n),
    x: data.x.slice(0, n),
    y: data.y.slice(0, n),
    z: data.z.slice(0, n),
    count: n,
  };
}
