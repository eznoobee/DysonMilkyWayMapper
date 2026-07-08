import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Orbit / zoom / pan camera controls plus:
//  - click-vs-drag threshold so draw tools can place on a clean click
//  - shift-left-drag pans (right-drag pans natively)
//  - T tweens to a top-down view
//  - continuous y=0 plane raycast for the cursor readout and tool ghosts

const CLICK_THRESHOLD_PX = 5;
const PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function createControls(camera, domElement, { onPlaneClick, onPlaneMove }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 1.2;
  controls.minDistance = 20;
  controls.maxDistance = 20000;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  function planePoint(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(PLANE, hit) ? hit : null;
  }

  let downX = 0, downY = 0, downButton = -1;
  domElement.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
    downButton = e.button;
    // shift-left-drag = pan
    controls.mouseButtons.LEFT = e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  });
  domElement.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (downButton === 0 && e.button === 0 && !e.shiftKey && moved < CLICK_THRESHOLD_PX) {
      const p = planePoint(e.clientX, e.clientY);
      if (p) onPlaneClick({ x: p.x, z: p.z });
    }
    downButton = -1;
  });
  domElement.addEventListener('pointermove', (e) => {
    const p = planePoint(e.clientX, e.clientY);
    onPlaneMove(p ? { x: p.x, z: p.z } : null);
  });
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  // T = tween to top-down over the current target
  let anim = null;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 't' && e.key !== 'T') return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const offset = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    anim = {
      t: 0,
      fromPhi: sph.phi,
      fromTheta: sph.theta,
      radius: sph.radius,
      toPhi: 0.02, // not exactly 0 to keep OrbitControls stable
      toTheta: sph.theta,
    };
  });

  function update(dt) {
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / 0.4);
      const k = 1 - Math.pow(1 - anim.t, 3); // ease-out cubic
      const sph = new THREE.Spherical(
        anim.radius,
        anim.fromPhi + (anim.toPhi - anim.fromPhi) * k,
        anim.fromTheta + (anim.toTheta - anim.fromTheta) * k
      );
      camera.position.setFromSpherical(sph).add(controls.target);
      camera.lookAt(controls.target);
      if (anim.t >= 1) anim = null;
    }
    controls.update();
  }

  return { controls, update, planePoint };
}
