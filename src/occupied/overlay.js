import * as THREE from 'three';

// Lit/occupied clusters rendered like the in-game view: bright glowing
// stars whose size and warmth scale with generated power (caps).

const VERT = /* glsl */ `
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float size = aSize * (900.0 / -mv.z);
    gl_PointSize = clamp(size, 4.0, 42.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    // bright core + wide halo
    float core = smoothstep(0.16, 0.0, d);
    float halo = smoothstep(0.5, 0.05, d);
    float a = core + halo * halo * 0.6;
    gl_FragColor = vec4(vColor * a + vec3(1.0) * core * 0.7, a);
  }
`;

// caps -> 0..1 heat
function heat(caps, maxCaps) {
  if (maxCaps <= 0) return 0;
  return Math.log2(1 + caps) / Math.log2(1 + maxCaps);
}

export function createOverlay(scene) {
  let points = null;
  let placed = []; // indices into the occupied dataset that have positions

  function setData(occupied) {
    if (points) {
      scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
      points = null;
    }
    placed = [];
    if (!occupied || occupied.count === 0) return;

    let maxCaps = 0;
    for (let i = 0; i < occupied.count; i++) {
      if (occupied.caps[i] > maxCaps) maxCaps = occupied.caps[i];
    }
    for (let i = 0; i < occupied.count; i++) {
      if (!Number.isNaN(occupied.x[i])) placed.push(i);
    }
    const n = placed.length;
    const pos = new Float32Array(n * 3);
    const col = new Uint8Array(n * 3);
    const size = new Float32Array(n);
    placed.forEach((oi, k) => {
      pos[k * 3] = occupied.x[oi];
      pos[k * 3 + 1] = occupied.y[oi];
      pos[k * 3 + 2] = occupied.z[oi];
      const h = heat(occupied.caps[oi], maxCaps);
      // dim gold -> hot white-blue with power
      col[k * 3] = 255 * (0.9 + h * 0.1);
      col[k * 3 + 1] = 255 * (0.72 + h * 0.28);
      col[k * 3 + 2] = 255 * (0.45 + h * 0.55);
      size[k] = 7 + h * 22;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 2;
    scene.add(points);
  }

  function setVisible(v) {
    if (points) points.visible = v;
  }

  // Screen-space picking: nearest placed lit star within `maxPx` of the
  // cursor. Occupied sets are small (thousands), so brute force is instant.
  const v3 = new THREE.Vector3();
  function pick(occupied, camera, rect, clientX, clientY, maxPx = 14) {
    if (!points || !points.visible || !occupied) return -1;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best = -1;
    let bestD2 = maxPx * maxPx;
    for (const oi of placed) {
      v3.set(occupied.x[oi], occupied.y[oi], occupied.z[oi]).project(camera);
      if (v3.z > 1) continue; // behind camera
      const sx = (v3.x + 1) / 2 * rect.width;
      const sy = (1 - v3.y) / 2 * rect.height;
      const dx = sx - px, dy = sy - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = oi;
      }
    }
    return best;
  }

  return { setData, setVisible, pick };
}
