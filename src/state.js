// Central app state with a tiny pub/sub. No frameworks: modules subscribe to
// the events they care about and mutate state through the helpers below.

import { MODE_COMBAT } from './address.js';

const listeners = new Map(); // event -> Set<fn>

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of set) fn(payload);
}

export const state = {
  // Loaded dump: typed arrays, all the same length `count`.
  dataset: null, // { seeds:Int32Array, x:Float32Array, y:Float32Array, z:Float32Array, count, filename, grid }

  // Cluster settings driving address generation. Prefilled from the dump filename.
  settings: {
    starCount: 64,
    resourceMultiplier: Infinity,
    mode: MODE_COMBAT,
    fogDifficulty: 0,
  },

  // Shape targets on the y=0 plane. Parallel arrays; groups drive undo.
  targets: {
    xs: [], zs: [], roles: [],
    groups: [], // [{ kind:'circle'|'line'|'point', start, count }]
  },

  // Matching
  yMax: 15,
  matches: null, // { pointIndex:Int32Array(-1 = unmatched), errXZ:Float64Array, matchedCount, medianErr, maxErr }

  tool: 'browse', // browse | circle | line | point
  circle: { radius: 120, dots: 40, center: true },
  lineDots: 12,

  // Lit/occupied clusters from the plugin's F10 dump (positions + stats),
  // optionally refreshed from the server blob (stats only).
  occupied: null, // { seedKeys:BigInt[], decoded[], x,y,z:F32, caps:F32, engineers:Int32, count, unplaced }

  // View toggles for the in-game-style rendering.
  view: {
    candidates: 'bright', // bright | dim | hidden
    backdrop: true,
    starfield: true,
    occupied: true,
    inspect: true,
  },
};

export function setOccupied(occupied) {
  state.occupied = occupied;
  emit('occupied');
}

export function setView(patch) {
  Object.assign(state.view, patch);
  emit('view');
}

export function setDataset(dataset) {
  state.dataset = dataset;
  clearMatches();
  emit('dataset');
}

export function setSettings(patch) {
  Object.assign(state.settings, patch);
  clearMatches(); // invariant 1.5: settings must equal the dump's; old matches invalid
  emit('settings');
}

export function setTool(tool) {
  state.tool = tool;
  emit('tool');
}

export function setYMax(v) {
  state.yMax = v;
  emit('ymax');
}

export function addTargets(kind, points /* [{x,z,role}] */) {
  const t = state.targets;
  t.groups.push({ kind, start: t.xs.length, count: points.length });
  for (const p of points) {
    t.xs.push(p.x);
    t.zs.push(p.z);
    t.roles.push(p.role);
  }
  emit('targets');
}

export function undoTargets() {
  const t = state.targets;
  const g = t.groups.pop();
  if (!g) return;
  t.xs.length = g.start;
  t.zs.length = g.start;
  t.roles.length = g.start;
  emit('targets');
}

export function clearTargets() {
  const t = state.targets;
  t.xs.length = 0;
  t.zs.length = 0;
  t.roles.length = 0;
  t.groups.length = 0;
  emit('targets');
}

export function setMatches(matches) {
  state.matches = matches;
  emit('matches');
}

export function clearMatches() {
  if (state.matches) {
    state.matches = null;
    emit('matches');
  }
}
