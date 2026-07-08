import * as THREE from 'three';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030510);

  const camera = new THREE.PerspectiveCamera(
    55, container.clientWidth / container.clientHeight, 1, 40000
  );
  camera.position.set(0, 2200, 1600);
  camera.lookAt(0, 0, 0);

  // Faint polar grid on the galactic plane for orientation.
  const grid = new THREE.PolarGridHelper(1800, 12, 6, 96, 0x1a3a52, 0x102435);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.material.depthWrite = false;
  scene.add(grid);

  const frameCallbacks = [];
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    for (const cb of frameCallbacks) cb(dt);
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  return {
    renderer, scene, camera,
    onFrame: (cb) => frameCallbacks.push(cb),
  };
}
