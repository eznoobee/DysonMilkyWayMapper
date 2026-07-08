import './style.css';
import { createScene } from './render/scene.js';
import { createGalaxy } from './render/galaxy.js';
import { createMarkers } from './render/markers.js';
import { createControls } from './render/controls.js';
import { createTools } from './tools.js';
import { initLoading } from './csv/load.js';
import { initPanels, updateHud } from './ui/panels.js';
import { state, on, setMatches, clearMatches } from './state.js';
import { matchTargets } from './match/matcher.js';
import { addressText, csvText, buildRows } from './export.js';

// Debug/automation handle (used by the e2e tests; harmless in normal use).
window.__mw = { state, addressText, csvText, buildRows };

const viewport = document.getElementById('viewport');
const { renderer, scene, camera, onFrame } = createScene(viewport);
const galaxy = createGalaxy(scene);
const markers = createMarkers(scene);
const tools = createTools(markers);

const controlsApi = createControls(camera, renderer.domElement, {
  onPlaneClick: (p) => tools.onPlaneClick(p),
  onPlaneMove: (p) => tools.onPlaneMove(p),
});
onFrame((dt) => controlsApi.update(dt));

const loadingUi = initPanels();

initLoading({
  fileInput: document.getElementById('file-input'),
  dropZone: document.body,
  onProgress: loadingUi.showProgress,
  onLoaded: loadingUi.showLoaded,
  onError: loadingUi.showError,
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
on('dataset', () => {
  const d = state.dataset;
  galaxy.setData(d.x, d.y, d.z, d.count);
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
    cursor: tools.getCursor(),
  });
});
