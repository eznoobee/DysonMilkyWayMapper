import * as THREE from 'three';

// The full dump as one additive-blended Points draw call.
// Per-star color and size are hashed from the seed so the cloud reads like
// the in-game Milky Way (mostly warm white/gold, some blue-white giants,
// a few orange/red dwarfs) instead of a uniform tint.

const VERT = /* glsl */ `
  attribute float aSize;
  varying vec3 vColor;
  uniform float uSize;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float size = uSize * aSize * (600.0 / -mv.z);
    gl_PointSize = clamp(size, 1.0, 11.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    a *= a * uOpacity;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

// [r, g, b, weight] — weights sum to 1; loosely matching DSP star types.
const PALETTE = [
  [1.0, 0.956, 0.84, 0.42],  // warm white
  [1.0, 0.851, 0.541, 0.22], // gold
  [0.812, 0.894, 1.0, 0.16], // blue-white
  [1.0, 0.706, 0.42, 0.12],  // orange
  [1.0, 0.53, 0.38, 0.08],   // red dwarf
];

function hash32(x) {
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function createGalaxy(scene) {
  let points = null;

  function setData(x, y, z, count, seeds) {
    if (points) {
      scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
      points = null;
    }
    const pos = new Float32Array(count * 3);
    const col = new Uint8Array(count * 3);
    const size = new Float32Array(count);

    // cumulative palette thresholds scaled to 2^32
    const thresholds = [];
    let acc = 0;
    for (const p of PALETTE) {
      acc += p[3];
      thresholds.push(acc * 4294967296);
    }

    for (let i = 0; i < count; i++) {
      pos[i * 3] = x[i];
      pos[i * 3 + 1] = y[i];
      pos[i * 3 + 2] = z[i];
      const h = hash32(seeds ? seeds[i] : i);
      let pi = 0;
      while (pi < thresholds.length - 1 && h > thresholds[pi]) pi++;
      const p = PALETTE[pi];
      // small per-star brightness jitter so arms shimmer
      const jitter = 0.75 + ((h >>> 8) & 255) / 255 * 0.35;
      col[i * 3] = Math.min(255, p[0] * 255 * jitter);
      col[i * 3 + 1] = Math.min(255, p[1] * 255 * jitter);
      col[i * 3 + 2] = Math.min(255, p[2] * 255 * jitter);
      // size: mostly small, occasional bright giant
      const u = ((h >>> 16) & 65535) / 65535;
      size[i] = 0.7 + u * u * u * 1.6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSize: { value: 2.6 },
        uOpacity: { value: 1.0 },
      },
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 1;
    scene.add(points);
  }

  // mode: 'bright' | 'dim' | 'hidden'
  function setMode(mode) {
    if (!points) return;
    points.visible = mode !== 'hidden';
    points.material.uniforms.uOpacity.value = mode === 'dim' ? 0.22 : 1.0;
  }

  return { setData, setMode };
}
