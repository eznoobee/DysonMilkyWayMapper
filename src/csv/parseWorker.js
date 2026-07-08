// Web Worker wrapper around the shared CSV parser core.
import { parseFile } from './parseCore.js';

self.onmessage = async (e) => {
  try {
    const result = await parseFile(e.data.file, (bytes, totalBytes, rows) => {
      self.postMessage({ type: 'progress', bytes, totalBytes, rows });
    });
    self.postMessage(
      { type: 'done', ...result },
      [result.seeds.buffer, result.x.buffer, result.y.buffer, result.z.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
