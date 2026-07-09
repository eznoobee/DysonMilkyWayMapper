// File picker + drag-and-drop wiring; drives the parse worker and reports
// progress. Falls back to parsing on the main thread when the worker can't
// start (Chromium blocks blob-URL workers on file:// pages). On completion
// builds the spatial grid and publishes the dataset.

import ParseWorker from './parseWorker.js?worker&inline';
import { parseFile } from './parseCore.js';
import { parseDumpFilename } from '../filename.js';
import { buildGrid } from '../match/grid.js';
import { setDataset, setSettings, setOccupied, state } from '../state.js';
import { parseOccupiedCsv } from '../occupied/parse.js';
import { parseBlob, mergeBlobRecords } from '../occupied/blob.js';

export function initLoading({ fileInput, dropZone, onProgress, onLoaded, onError, onOccupied }) {
  let loading = false;

  function finish(file, result) {
    if (result.count === 0) {
      loading = false;
      onError(`No rows parsed from "${file.name}" — expected header "seed,x,y,z".`);
      return;
    }
    const grid = buildGrid(result.x, result.z, result.count);
    const meta = parseDumpFilename(file.name);
    if (meta) {
      setSettings({
        starCount: meta.starCount,
        resourceMultiplier: meta.resourceMultiplier,
        mode: meta.mode,
        fogDifficulty: meta.fogDifficulty,
      });
    }
    setDataset({
      seeds: result.seeds, x: result.x, y: result.y, z: result.z,
      count: result.count, filename: file.name, grid,
      prefilled: !!meta,
    });
    loading = false;
    onLoaded(result.count, file.name, !!meta);
  }

  async function parseOnMainThread(file) {
    try {
      const result = await parseFile(file, onProgress);
      finish(file, result);
    } catch (err) {
      loading = false;
      onError(String((err && err.message) || err));
    }
  }

  async function handleOccupiedFile(file, kind) {
    try {
      if (kind === 'csv') {
        setOccupied(parseOccupiedCsv(await file.text()));
      } else {
        const records = await parseBlob(await file.arrayBuffer());
        setOccupied(mergeBlobRecords(state.occupied, records));
      }
      const o = state.occupied;
      onOccupied(o.count, o.unplaced, file.name);
    } catch (err) {
      onError(`${file.name}: ${String((err && err.message) || err)}`);
    }
  }

  async function routeFile(file) {
    if (!file) return;
    // Sniff the header: position dumps start "seed,", occupied dumps
    // "seedkey,"; anything else is treated as a server blob.
    const head = (await file.slice(0, 64).text()).toLowerCase();
    if (/^seedkey\s*,/.test(head)) return handleOccupiedFile(file, 'csv');
    if (/^seed\s*,/.test(head)) return handleFile(file);
    if (/\.csv$/i.test(file.name)) return handleFile(file); // headerless? let the parser complain
    return handleOccupiedFile(file, 'blob');
  }

  function handleFile(file) {
    if (!file || loading) return;
    loading = true;
    onProgress(0, file.size, 0);

    let worker;
    try {
      worker = new ParseWorker();
    } catch {
      parseOnMainThread(file);
      return;
    }
    let fellBack = false;
    worker.onerror = () => {
      // Worker failed to start (e.g. file:// page): parse here instead.
      worker.terminate();
      if (fellBack) return;
      fellBack = true;
      parseOnMainThread(file);
    };
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress(msg.bytes, msg.totalBytes, msg.rows);
      } else if (msg.type === 'done') {
        worker.terminate();
        finish(file, msg);
      } else if (msg.type === 'error') {
        worker.terminate();
        loading = false;
        onError(msg.message);
      }
    };
    worker.postMessage({ file });
  }

  fileInput.addEventListener('change', () => {
    for (const f of fileInput.files) routeFile(f);
  });

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { stop(e); dropZone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { stop(e); dropZone.classList.remove('drag-over'); }));
  dropZone.addEventListener('drop', (e) => {
    const files = (e.dataTransfer && e.dataTransfer.files) || [];
    for (const f of files) routeFile(f);
  });
}
