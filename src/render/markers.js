import * as THREE from 'three';

// Marker layers rendered on top of the galaxy:
//  - amber dots  = shape targets (on the y=0 plane)
//  - cyan dots   = matched stars (at their true 3D position)
//  - ghost group = live previews for the circle / line tools

const VERT = /* glsl */ `
  uniform float uSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRing; // 1.0 = hollow ring, 0.0 = soft dot
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a;
    if (uRing > 0.5) {
      a = smoothstep(0.5, 0.42, d) * smoothstep(0.24, 0.32, d);
    } else {
      a = smoothstep(0.5, 0.12, d);
    }
    gl_FragColor = vec4(uColor, a * 0.95);
  }
`;

function makeLayer(scene, { color, size, ring, renderOrder }) {
  const geo = new THREE.BufferGeometry();
  let capacity = 256;
  let attr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  geo.setAttribute('position', attr);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uSize: { value: size },
      uColor: { value: new THREE.Color(color) },
      uRing: { value: ring ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = renderOrder;
  scene.add(points);

  function set(positions /* array of [x,y,z] flat Float-ish */, count) {
    if (count > capacity) {
      while (capacity < count) capacity *= 2;
      attr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
      geo.setAttribute('position', attr);
    }
    attr.array.set(positions.subarray ? positions.subarray(0, count * 3) : positions.slice(0, count * 3));
    attr.needsUpdate = true;
    geo.setDrawRange(0, count);
  }

  return { set, points };
}

export function createMarkers(scene) {
  const targetLayer = makeLayer(scene, { color: 0xffb347, size: 12, ring: true, renderOrder: 3 });
  const matchedLayer = makeLayer(scene, { color: 0x53ffd0, size: 8, ring: false, renderOrder: 4 });
  const ghostLayer = makeLayer(scene, { color: 0xffb347, size: 9, ring: true, renderOrder: 5 });
  ghostLayer.points.material.uniforms.uColor.value = new THREE.Color(0x8a6a3a);

  // Ghost outline (circle ring / line segment)
  const ghostLineMat = new THREE.LineBasicMaterial({
    color: 0xffb347, transparent: true, opacity: 0.35, depthTest: false,
  });
  let ghostLine = null;

  function setTargets(xs, zs) {
    const n = xs.length;
    const buf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      buf[i * 3] = xs[i];
      buf[i * 3 + 1] = 0;
      buf[i * 3 + 2] = zs[i];
    }
    targetLayer.set(buf, n);
  }

  function setMatched(dataset, pointIndex) {
    let n = 0;
    for (let i = 0; i < pointIndex.length; i++) if (pointIndex[i] >= 0) n++;
    const buf = new Float32Array(n * 3);
    let k = 0;
    for (let i = 0; i < pointIndex.length; i++) {
      const p = pointIndex[i];
      if (p < 0) continue;
      buf[k * 3] = dataset.x[p];
      buf[k * 3 + 1] = dataset.y[p];
      buf[k * 3 + 2] = dataset.z[p];
      k++;
    }
    matchedLayer.set(buf, n);
  }

  // dots: flat [x,z] pairs; outline: flat [x,z] polyline; closed: loop it
  function setGhost(dots, outline, closed) {
    const n = dots ? dots.length / 2 : 0;
    const buf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      buf[i * 3] = dots[i * 2];
      buf[i * 3 + 1] = 0;
      buf[i * 3 + 2] = dots[i * 2 + 1];
    }
    ghostLayer.set(buf, n);

    if (ghostLine) {
      scene.remove(ghostLine);
      ghostLine.geometry.dispose();
      ghostLine = null;
    }
    if (outline && outline.length >= 4) {
      const m = outline.length / 2;
      const lbuf = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        lbuf[i * 3] = outline[i * 2];
        lbuf[i * 3 + 1] = 0;
        lbuf[i * 3 + 2] = outline[i * 2 + 1];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(lbuf, 3));
      ghostLine = closed ? new THREE.LineLoop(g, ghostLineMat) : new THREE.Line(g, ghostLineMat);
      ghostLine.renderOrder = 5;
      scene.add(ghostLine);
    }
  }

  function clearGhost() {
    setGhost(null, null, false);
  }

  return { setTargets, setMatched, setGhost, clearGhost };
}
