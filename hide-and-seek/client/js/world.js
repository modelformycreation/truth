// ============================================================================
// client/js/world.js — builds the three.js scene from shared/map.js data.
// The ENTIRE static map renders as ONE merged mesh with vertex colors (plus a
// second merged mesh for emissive light fixtures): 2 draw calls for ~300
// boxes, which is what makes this run well on mid-range phones.
// ============================================================================

import * as THREE from 'three';
import { getMap } from '../../shared/map.js';

const EMISSIVE = new Set(['light', 'sign']); // cosmetic: emissive, no collision, no LOS

/** Build (and re-parent) the static map meshes + grid for `map` into the scene. */
function buildMapGeometry(scene, map) {
  const solid = new THREE.Group();
  solid.add(mergeBoxes(map.boxes.filter((b) => !EMISSIVE.has(b.kind)), (b) => b.color));
  scene.add(solid);

  const lightsMesh = mergeBoxes(map.boxes.filter((b) => EMISSIVE.has(b.kind)), (b) => b.color ?? 0xfff2cc);
  lightsMesh.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  scene.add(lightsMesh);

  // subtle floor grid for motion parallax in big halls, centred on the map
  const grid = new THREE.GridHelper(90, 90, 0x223048, 0x161d2c);
  const b = map.bounds;
  grid.position.set((b.minX + b.maxX) / 2, 0.02, (b.minZ + b.maxZ) / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  return { solid, lightsMesh, grid };
}

function disposeMapGeometry(scene, g) {
  scene.remove(g.solid, g.lightsMesh, g.grid);
  g.solid.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose?.(); } });
  g.lightsMesh.geometry.dispose(); g.lightsMesh.material.dispose();
  g.grid.geometry.dispose(); g.grid.material.dispose();
}

export function buildWorld(canvas, quality = 'medium', mapId = 'facility') {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1018);
  scene.fog = new THREE.Fog(0x0d1018, 18, 78);

  const pixelRatio = quality === 'low' ? 1 : quality === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.5);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 220);
  camera.position.set(31, 3, 40);

  // ---------------- lights (map-independent, persistent) ----------------
  const hemi = new THREE.HemisphereLight(0x9db4d8, 0x2c313c, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe9c4, 0.75);
  sun.position.set(40, 60, -30);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6a86c8, 0.28);
  fill.position.set(-30, 40, 35);
  scene.add(fill);

  // ---------------- current map ----------------
  let map = getMap(mapId);
  let geo = buildMapGeometry(scene, map);

  const world = {
    scene, camera, renderer,
    get map() { return map; },
    get colliders() { return map.colliders; },
    get ladders() { return map.ladders; },
    get bounds() { return map.bounds; },
    /** Swap in a different map (same renderer/camera). The controller reads
     *  world.colliders/ladders/bounds live, so it follows automatically. */
    setMap(nextId) {
      const next = getMap(nextId);
      if (next === map) return;
      disposeMapGeometry(scene, geo);
      map = next;
      geo = buildMapGeometry(scene, map);
    },
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
  return world;
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
