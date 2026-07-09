import './style.css';
import * as THREE from 'three';
import { createScene } from './render/scene.js';
import { createGalaxy } from './render/galaxy.js';
import { createBackdrop } from './render/backdrop.js';
import { createStarfield } from './render/starfield.js';
import { createMarkers } from './render/markers.js';
import { createControls } from './render/controls.js';
import { createOverlay } from './occupied/overlay.js';
import { createTools } from './tools.js';
import { initLoading } from './csv/load.js';
import { initPanels, updateHud } from './ui/panels.js';
import { createInspect } from './ui/inspect.js';
import { state, on, setMatches, clearMatches } from './state.js';
import { matchTargets } from './match/matcher.js';
import { addressText, csvText, buildRows } from './export.js';

// Debug/automation handle (used by the e2e tests; harmless in normal use).
window.__mw = { state, addressText, csvText, buildRows };
window.__mw.projectForTest = (x, y, z) => {
  const v = new THREE.Vector3(x, y, z).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (v.x + 1) / 2 * rect.width,
    y: rect.top + (1 - v.y) / 2 * rect.height,
  };
};

const viewport = document.getElementById('viewport');
const { renderer, scene, camera, onFrame } = createScene(viewport);
const galaxy = createGalaxy(scene);
const backdrop = createBackdrop(scene);
const starfield = createStarfield(scene);
const overlay = createOverlay(scene);
const markers = createMarkers(scene);
const tools = createTools(markers);

const controlsApi = createControls(camera, renderer.domElement, {
  onPlaneClick: (p) => tools.onPlaneClick(p),
  onPlaneMove: (p) => tools.onPlaneMove(p),
});
onFrame((dt) => controlsApi.update(dt));

createInspect({
  dom: renderer.domElement,
  camera,
  overlay,
  planePoint: controlsApi.planePoint,
});

const loadingUi = initPanels();

initLoading({
  fileInput: document.getElementById('file-input'),
  dropZone: document.body,
  onProgress: loadingUi.showProgress,
  onLoaded: loadingUi.showLoaded,
  onError: loadingUi.showError,
  onOccupied: () => {}, // status renders reactively from the 'occupied' event
});

// ----- matching orchestration -----
let rematchQueued = false;
function scheduleRematch() {
  if (rematchQueued) return;
  rematchQueued = true;
  setTimeout(() => {
    rematchQueued = false;
    if (!state.dataset || state.targets.xs.length === 0) {
      clearMatches();
      return;
    }
    setMatches(matchTargets(state.dataset, state.targets, state.yMax));
  }, 0);
}
on('targets', scheduleRematch);
on('ymax', scheduleRematch);
on('dataset', scheduleRematch);

// ----- render layers from state -----
function applyView() {
  const v = state.view;
  galaxy.setMode(v.candidates);
  backdrop.setVisible(v.backdrop);
  starfield.setVisible(v.starfield);
  overlay.setVisible(v.occupied);
}
on('view', applyView);

on('dataset', () => {
  const d = state.dataset;
  galaxy.setData(d.x, d.y, d.z, d.count, d.seeds);
  backdrop.setData(d.x, d.z, d.count);
  applyView();
});
on('occupied', () => {
  overlay.setData(state.occupied);
  applyView();
});
on('targets', () => markers.setTargets(state.targets.xs, state.targets.zs));
on('matches', () => {
  if (state.matches) markers.setMatched(state.dataset, state.matches.pointIndex);
  else markers.setMatched({ x: [], y: [], z: [] }, new Int32Array(0));
});
on('tool', () => tools.refreshGhost());
on('toolparams', () => tools.refreshGhost());

// ----- HUD -----
onFrame(() => {
  updateHud({
    starCount: state.dataset ? state.dataset.count : 0,
    targetCount: state.targets.xs.length,
    matchedCount: state.matches ? state.matches.matchedCount : 0,
    litCount: state.occupied ? state.occupied.count - state.occupied.unplaced : 0,
    cursor: tools.getCursor(),
  });
});
