import * as THREE from 'three';

// Distant static starfield so the space around the galaxy isn't pitch black.
// A few thousand dim points on a huge sphere; purely cosmetic.

export function createStarfield(scene, count = 4000, radius = 16000) {
  const pos = new Float32Array(count * 3);
  const col = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    // uniform on sphere
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = radius * s * Math.cos(phi);
    pos[i * 3 + 1] = radius * u;
    pos[i * 3 + 2] = radius * s * Math.sin(phi);
    const warm = Math.random();
    const v = 90 + Math.random() * 130;
    col[i * 3] = v * (warm > 0.7 ? 1.0 : 0.85);
    col[i * 3 + 1] = v * 0.9;
    col[i * 3 + 2] = v * (warm > 0.7 ? 0.8 : 1.0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  const mat = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 0;
  scene.add(points);
  return {
    setVisible: (v) => { points.visible = v; },
  };
}
