// DOM wiring for the settings / matching / export panels, toolbar and HUD.

import {
  state, on, emit, setSettings, setTool, setYMax, undoTargets, clearTargets,
} from '../state.js';
import {
  clusterString, RESOURCE_MULTIPLIERS, MODE_COMBAT,
} from '../address.js';
import { copyAddresses, downloadCsv } from '../export.js';

const $ = (id) => document.getElementById(id);

const PREVIEW_SEED = 12345678;

export function initPanels() {
  // ----- settings -----
  const starsEl = $('set-stars');
  const resEl = $('set-res');
  const modeEl = $('set-mode');
  const fogEl = $('set-fog');
  const fogValueEl = $('fog-value');
  const fogRow = $('fog-row');
  const previewEl = $('address-preview');

  for (const m of RESOURCE_MULTIPLIERS) {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = m === Infinity ? 'Infinite' : `${m}x`;
    resEl.appendChild(opt);
  }

  function reflectSettings() {
    const s = state.settings;
    starsEl.value = s.starCount;
    resEl.value = String(s.resourceMultiplier);
    for (const b of modeEl.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.mode === s.mode);
    }
    const combat = s.mode === MODE_COMBAT;
    fogEl.disabled = !combat;
    fogRow.style.opacity = combat ? 1 : 0.4;
    fogEl.value = s.fogDifficulty;
    fogValueEl.textContent = s.fogDifficulty.toFixed(1);
    previewEl.textContent = clusterString(PREVIEW_SEED, s);
  }

  starsEl.addEventListener('change', () => {
    const v = Math.min(64, Math.max(32, parseInt(starsEl.value, 10) || 64));
    setSettings({ starCount: v });
  });
  resEl.addEventListener('change', () => {
    setSettings({ resourceMultiplier: parseFloat(resEl.value) });
  });
  modeEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setSettings({ mode: b.dataset.mode });
  });
  fogEl.addEventListener('input', () => {
    setSettings({ fogDifficulty: parseFloat(fogEl.value) });
  });

  on('settings', reflectSettings);
  reflectSettings();

  // ----- matching -----
  const ymaxEl = $('set-ymax');
  const ymaxValueEl = $('ymax-value');
  const reportEl = $('match-report');

  ymaxEl.addEventListener('input', () => {
    ymaxValueEl.textContent = ymaxEl.value;
    setYMax(parseFloat(ymaxEl.value));
  });

  function renderReport() {
    const n = state.targets.xs.length;
    const m = state.matches;
    if (!n) {
      reportEl.textContent = 'no targets';
      reportEl.className = 'mono dim';
      return;
    }
    if (!m) {
      reportEl.textContent = state.dataset
        ? `${n} target${n > 1 ? 's' : ''} — matching…`
        : `${n} target${n > 1 ? 's' : ''} — load a dump CSV to match`;
      reportEl.className = 'mono dim';
      return;
    }
    let html = `matched <span class="good">${m.matchedCount}</span> / ${n}`
      + `\nmedian err ${m.medianErr.toFixed(2)} · max ${m.maxErr.toFixed(2)}`;
    if (m.unmatchedCount > 0) {
      html += `\n<span class="bad">${m.unmatchedCount} unmatched — try raising the height filter</span>`;
    }
    reportEl.innerHTML = html;
    reportEl.className = 'mono';
  }
  on('matches', renderReport);
  on('targets', renderReport);
  on('dataset', renderReport);

  // ----- export -----
  const copyBtn = $('btn-copy');
  const dlBtn = $('btn-download');
  const exportStatus = $('export-status');

  function refreshExportButtons() {
    const ok = !!(state.matches && state.matches.matchedCount > 0);
    copyBtn.disabled = !ok;
    dlBtn.disabled = !ok;
    if (!ok) exportStatus.textContent = '';
  }
  on('matches', refreshExportButtons);
  refreshExportButtons();

  copyBtn.addEventListener('click', async () => {
    const ok = await copyAddresses();
    exportStatus.textContent = ok
      ? `copied ${state.matches.matchedCount} addresses`
      : 'copy failed';
  });
  dlBtn.addEventListener('click', () => {
    downloadCsv();
    exportStatus.textContent = `exported ${state.matches.matchedCount} rows`;
  });

  // ----- toolbar -----
  const toolButtons = $('tool-buttons');
  const paramsCircle = $('params-circle');
  const paramsLine = $('params-line');

  function reflectTool() {
    for (const b of toolButtons.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.tool === state.tool);
    }
    paramsCircle.hidden = state.tool !== 'circle';
    paramsLine.hidden = state.tool !== 'line';
  }
  toolButtons.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setTool(b.dataset.tool);
  });
  on('tool', reflectTool);
  reflectTool();

  const bindRange = (id, valueId, apply) => {
    const el = $(id);
    el.addEventListener('input', () => {
      $(valueId).textContent = el.value;
      apply(parseFloat(el.value));
      emit('toolparams');
    });
  };
  bindRange('circle-radius', 'circle-radius-value', (v) => { state.circle.radius = v; });
  bindRange('circle-dots', 'circle-dots-value', (v) => { state.circle.dots = v; });
  $('circle-center').addEventListener('change', (e) => {
    state.circle.center = e.target.checked;
    emit('toolparams');
  });
  bindRange('line-dots', 'line-dots-value', (v) => { state.lineDots = v; });

  $('btn-undo').addEventListener('click', undoTargets);
  $('btn-clear').addEventListener('click', clearTargets);

  // keyboard tool shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const map = { b: 'browse', c: 'circle', l: 'line', p: 'point' };
    const tool = map[e.key.toLowerCase()];
    if (tool && !e.ctrlKey && !e.metaKey) setTool(tool);
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undoTargets();
    }
  });

  // ----- loading UI -----
  const loadStatus = $('load-status');
  const progressWrap = $('progress-wrap');
  const progressBar = $('progress-bar');
  const progressText = $('progress-text');

  return {
    showProgress(bytes, totalBytes, rows) {
      progressWrap.hidden = false;
      const pct = totalBytes ? Math.round((bytes / totalBytes) * 100) : 0;
      progressBar.style.width = pct + '%';
      progressText.textContent = `${pct}% · ${rows.toLocaleString()} rows`;
    },
    showLoaded(count, filename, prefilled) {
      progressBar.style.width = '100%';
      setTimeout(() => { progressWrap.hidden = true; }, 600);
      loadStatus.textContent = `${count.toLocaleString()} stars · ${filename}`
        + (prefilled ? '' : '\n(filename not recognized — set settings manually)');
      loadStatus.className = 'mono';
    },
    showError(message) {
      progressWrap.hidden = true;
      loadStatus.textContent = `load error: ${message}`;
      loadStatus.className = 'mono bad';
    },
  };
}

export function updateHud({ starCount, targetCount, matchedCount, cursor }) {
  $('hud').textContent =
    `stars ${starCount ? starCount.toLocaleString() : '—'}` +
    `  ·  targets ${targetCount}` +
    `  ·  matched ${matchedCount}` +
    `  ·  cursor ${cursor ? `${cursor.x.toFixed(1)}, ${cursor.z.toFixed(1)}` : '—'}`;
}
