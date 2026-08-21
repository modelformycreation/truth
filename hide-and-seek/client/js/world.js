// ============================================================================
// client/js/world.js — builds the three.js scene from shared/map.js data.
// The ENTIRE static map renders as ONE merged mesh with vertex colors (plus a
// second merged mesh for emissive light fixtures): 2 draw calls for ~300
// boxes, which is what makes this run well on mid-range phones.
// ============================================================================

import * as THREE from 'three';
import { getMap } from '../../shared/map.js';

export function buildWorld(canvas, quality = 'medium') {
  const map = getMap('facility');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1018);
  scene.fog = new THREE.Fog(0x0d1018, 18, 78);

  const pixelRatio = quality === 'low' ? 1 : quality === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.5);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 220);
  camera.position.set(31, 3, 40);

  // ---------------- lights ----------------
  const hemi = new THREE.HemisphereLight(0x9db4d8, 0x2c313c, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe9c4, 0.75);
  sun.position.set(40, 60, -30);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6a86c8, 0.28);
  fill.position.set(-30, 40, 35);
  scene.add(fill);

  // ---------------- merged static geometry ----------------
  const solid = new THREE.Group();
  const solidBoxes = map.boxes.filter((b) => b.kind !== 'light');
  const solidMesh = mergeBoxes(solidBoxes, (b) => b.color);
  solid.add(solidMesh);
  scene.add(solid);

  const lightsMesh = mergeBoxes(map.boxes.filter((b) => b.kind === 'light'), () => 0xfff2cc);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
  lightsMesh.material = lightMat;
  scene.add(lightsMesh);

  // subtle floor grid for motion parallax in big halls
  const grid = new THREE.GridHelper(70, 70, 0x223048, 0x161d2c);
  grid.position.set(33, 0.02, 24);
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  return {
    scene, camera, renderer, map,
    colliders: map.colliders,
    ladders: map.ladders,
    bounds: map.bounds,
    resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    },
    setQuality(q) {
      const pr = q === 'low' ? 1 : q === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.5);
      renderer.setPixelRatio(pr);
    },
  };
}

/** Merge many axis-aligned colored boxes into a single BufferGeometry. */
function mergeBoxes(boxes, colorOf) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vertCount = 0;
  const tmp = new THREE.BoxGeometry(1, 1, 1);
  const basePos = tmp.attributes.position.array;
  const baseNorm = tmp.attributes.normal.array;
  const baseIdx = tmp.index.array;
  const c = new THREE.Color();

  for (const b of boxes) {
    const [cx, cy, cz] = b.c;
    const [sx, sy, sz] = b.s;
    c.set(colorOf(b) ?? 0x888888);
    for (let i = 0; i < basePos.length; i += 3) {
      positions.push(basePos[i] * sx + cx, basePos[i + 1] * sy + cy, basePos[i + 2] * sz + cz);
      normals.push(baseNorm[i], baseNorm[i + 1], baseNorm[i + 2]);
      colors.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < baseIdx.length; i++) indices.push(baseIdx[i] + vertCount);
    vertCount += basePos.length / 3;
  }
  tmp.dispose();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return new THREE.Mesh(geo, mat);
}
