import * as THREE from 'three';

// The full dump as one additive-blended Points draw call.
// Round soft sprites via gl_PointCoord falloff; warm star tint.

const VERT = /* glsl */ `
  uniform float uSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float size = uSize * (600.0 / -mv.z);
    gl_PointSize = clamp(size, 1.0, 9.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function createGalaxy(scene) {
  let points = null;

  function setData(x, y, z, count) {
    if (points) {
      scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
      points = null;
    }
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = x[i];
      pos[i * 3 + 1] = y[i];
      pos[i * 3 + 2] = z[i];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSize: { value: 2.4 },
        uColor: { value: new THREE.Color(0xffd9a8) },
      },
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

  return { setData };
}
