import * as THREE from 'three';

// Soft nebula backdrop generated from the loaded points themselves: bin the
// stars into a density grid, tone-map through a color ramp (warm core,
// violet-blue arms, transparent void) and blur. Because it is derived from
// the data, the glow always lines up with the real spiral arms.

const GRID = 512;
const CANVAS = 1024;

// density 0..1 -> rgba
function ramp(d) {
  if (d <= 0) return [0, 0, 0, 0];
  const t = Math.min(1, d);
  let r, g, b;
  if (t < 0.32) {
    const k = t / 0.32;
    r = 18 + 50 * k; g = 30 + 45 * k; b = 80 + 110 * k; // deep blue -> violet-blue
  } else if (t < 0.62) {
    const k = (t - 0.32) / 0.3;
    r = 68 + 140 * k; g = 75 + 85 * k; b = 190 - 45 * k; // violet -> dusty gold-mauve
  } else {
    const k = (t - 0.62) / 0.38;
    r = 208 + 47 * k; g = 160 + 85 * k; b = 145 + 70 * k; // -> warm white-gold
  }
  const a = Math.min(1, 0.12 + t * 0.88) * 255;
  return [r, g, b, a];
}

export function createBackdrop(scene) {
  let mesh = null;

  function setData(x, z, count) {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map.dispose();
      mesh.material.dispose();
      mesh = null;
    }

    // extent: symmetric square around origin covering ~99.5% of points
    let maxR = 0;
    const step = Math.max(1, Math.floor(count / 200000));
    for (let i = 0; i < count; i += step) {
      const r = Math.max(Math.abs(x[i]), Math.abs(z[i]));
      if (r > maxR) maxR = r;
    }
    const half = maxR * 1.05;

    // density grid
    const density = new Float32Array(GRID * GRID);
    const scale = GRID / (2 * half);
    for (let i = 0; i < count; i++) {
      const gx = ((x[i] + half) * scale) | 0;
      const gz = ((z[i] + half) * scale) | 0;
      if (gx >= 0 && gx < GRID && gz >= 0 && gz < GRID) density[gz * GRID + gx]++;
    }

    // normalize on a high percentile so the core doesn't crush the arms
    const sorted = Float32Array.from(density).sort();
    let hi = sorted[Math.floor(sorted.length * 0.999)] || 1;
    if (hi < 4) hi = 4;

    const img = new ImageData(GRID, GRID);
    for (let i = 0; i < density.length; i++) {
      const d = Math.pow(Math.min(1, density[i] / hi), 0.6);
      const [r, g, b, a] = ramp(d);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = a;
    }

    const src = document.createElement('canvas');
    src.width = src.height = GRID;
    src.getContext('2d').putImageData(img, 0, 0);

    // blur up into the display canvas (two passes for a soft volumetric feel)
    const dst = document.createElement('canvas');
    dst.width = dst.height = CANVAS;
    const ctx = dst.getContext('2d');
    ctx.filter = 'blur(10px)';
    ctx.drawImage(src, 0, 0, CANVAS, CANVAS);
    ctx.filter = 'blur(3px)';
    ctx.globalAlpha = 0.7;
    ctx.drawImage(dst, 0, 0);

    const tex = new THREE.CanvasTexture(dst);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0.72,
    });
    const geo = new THREE.PlaneGeometry(2 * half, 2 * half);
    mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    // ImageData rows run +z; flip so the texture matches world z
    mesh.scale.y = -1;
    mesh.position.y = -6;
    mesh.renderOrder = 0;
    scene.add(mesh);
  }

  function setVisible(v) {
    if (mesh) mesh.visible = v;
  }

  return { setData, setVisible };
}
