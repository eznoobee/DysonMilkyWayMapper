// Export matched targets: clipboard address list and CSV download.

import { state } from './state.js';
import { clusterString, resourceLabel, modeLabel } from './address.js';

// Rows in target placement order, matched targets only.
export function buildRows() {
  const { dataset, targets, matches, settings } = state;
  if (!dataset || !matches) return [];
  const rows = [];
  for (let t = 0; t < targets.xs.length; t++) {
    const p = matches.pointIndex[t];
    if (p < 0) continue;
    const seed = dataset.seeds[p];
    rows.push({
      role: targets.roles[t],
      seed,
      address: clusterString(seed, settings),
      x: dataset.x[p],
      y: dataset.y[p],
      z: dataset.z[p],
      err: matches.errXZ[t],
    });
  }
  return rows;
}

export function addressText() {
  return buildRows().map((r) => r.address).join('\n');
}

export function csvText() {
  const { settings } = state;
  const head = 'role,seed,cluster_address,star_count,resources,mode,fog_difficulty,x,y,z,err_xz';
  const lines = buildRows().map((r) =>
    [
      r.role,
      String(r.seed).padStart(8, '0'),
      r.address,
      settings.starCount,
      resourceLabel(settings.resourceMultiplier),
      modeLabel(settings.mode),
      settings.mode === 'combat' ? settings.fogDifficulty : 0,
      r.x.toFixed(3),
      r.y.toFixed(3),
      r.z.toFixed(3),
      r.err.toFixed(3),
    ].join(',')
  );
  return [head, ...lines].join('\n') + '\n';
}

export async function copyAddresses() {
  const text = addressText();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API can be unavailable on file:// — fall back to execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function downloadCsv() {
  const text = csvText();
  const blob = new Blob([text], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'milkyway_cluster_addresses.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
