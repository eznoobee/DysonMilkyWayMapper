// Draw tools: Browse (orbit only), Circle, Line, Point.
// Targets live on the y=0 plane; clicks arrive pre-filtered by the
// click-vs-drag threshold in controls.js.

import { state, addTargets } from './state.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function createTools(markers) {
  let cursor = null;      // {x,z} | null
  let lineAnchor = null;  // {x,z} while a line's first point is placed
  let pointCounter = 0;   // running index for pt_NN roles

  function circleDots(cx, cz) {
    const { radius, dots, center } = state.circle;
    const pts = [];
    if (center) pts.push({ x: cx, z: cz, role: 'center' });
    for (let i = 0; i < dots; i++) {
      const a = (i / dots) * Math.PI * 2;
      pts.push({
        x: cx + Math.cos(a) * radius,
        z: cz + Math.sin(a) * radius,
        role: `ring_${pad2(i)}`,
      });
    }
    return pts;
  }

  function lineDotsBetween(a, b) {
    const n = Math.max(2, state.lineDots);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        role: `line_${pad2(i)}`,
      });
    }
    return pts;
  }

  function refreshGhost() {
    if (!cursor) {
      markers.clearGhost();
      return;
    }
    if (state.tool === 'circle') {
      const pts = circleDots(cursor.x, cursor.z);
      const dots = new Float32Array(pts.length * 2);
      pts.forEach((p, i) => { dots[i * 2] = p.x; dots[i * 2 + 1] = p.z; });
      const seg = 64;
      const outline = new Float32Array(seg * 2);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        outline[i * 2] = cursor.x + Math.cos(a) * state.circle.radius;
        outline[i * 2 + 1] = cursor.z + Math.sin(a) * state.circle.radius;
      }
      markers.setGhost(dots, outline, true);
    } else if (state.tool === 'line' && lineAnchor) {
      const pts = lineDotsBetween(lineAnchor, cursor);
      const dots = new Float32Array(pts.length * 2);
      pts.forEach((p, i) => { dots[i * 2] = p.x; dots[i * 2 + 1] = p.z; });
      markers.setGhost(dots, new Float32Array([lineAnchor.x, lineAnchor.z, cursor.x, cursor.z]), false);
    } else if (state.tool === 'point') {
      markers.setGhost(new Float32Array([cursor.x, cursor.z]), null, false);
    } else {
      markers.clearGhost();
    }
  }

  function onPlaneMove(p) {
    cursor = p;
    refreshGhost();
  }

  function onPlaneClick(p) {
    switch (state.tool) {
      case 'circle':
        addTargets('circle', circleDots(p.x, p.z));
        break;
      case 'line':
        if (!lineAnchor) {
          lineAnchor = { x: p.x, z: p.z };
        } else {
          addTargets('line', lineDotsBetween(lineAnchor, p));
          lineAnchor = null;
        }
        refreshGhost();
        break;
      case 'point':
        addTargets('point', [{ x: p.x, z: p.z, role: `pt_${pad2(pointCounter++)}` }]);
        break;
      default:
        break; // browse: orbit only
    }
  }

  function cancelPending() {
    lineAnchor = null;
    refreshGhost();
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelPending();
  });

  return { onPlaneMove, onPlaneClick, refreshGhost, cancelPending, getCursor: () => cursor };
}
