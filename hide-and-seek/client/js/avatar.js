// ============================================================================
// client/js/avatar.js — Free Fire-style player characters (v2: proper body)
//
// Design goals (vs v1 which still read as "Minecraft" in playtest):
//   * HUMAN proportions: smaller head, longer slimmer legs, TAPERED torso
//     (shoulders -> chest -> waist, via a lathe profile), narrow hips.
//   * CLOTHING that reads as clothing: belt + buckle, shirt hem, sleeve
//     cuffs, jacket zipper + collar, hoodie hood + front pocket + drawstrings,
//     sock cuffs, two-tone sneakers with soles.
//   * A real face: eye whites + pupils, brows, nose, mouth, ears.
//   * Higher segment counts + always-on antialiasing (world.js) for smooth
//     silhouettes.
//   * per-player DETERMINISTIC look — seeded from the player id so every
//     client renders the same player identically.
//   * full procedural gait (walk/run/idle/jump/land squash) driven by real
//     speed, in sync with the footstep audio.
//   * team cues: coloured armband (hider green / seeker orange) + seeker
//     goggle band + lenses.
//
// The public API is unchanged: group, state, body, head, setPos, setRot,
// setFound, setRevealed, setTalking, ping, animate, dispose.
// ============================================================================

import * as THREE from 'three';
import { TEAMS } from '../../shared/constants.js';
import { DEFAULT_CONFIG } from '../../shared/config.js';

const TEAM_COLORS = { [TEAMS.HIDERS]: 0x35d07f, [TEAMS.SEEKERS]: 0xff6a3d };
const FOUND_COLOR = 0xb9c0cc;
const DARK = 0x14161c;
const WHITE = 0xf4f6fa;
const SOCK = 0xdfe4ec;

// ---- shared / cached geometry ---------------------------------------------
const GEO = {
  sphere: new THREE.SphereGeometry(1, 18, 14),   // unit — scaled per part
  hemi: new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), // dome
  circle: new THREE.CircleGeometry(1, 20),
  ring: new THREE.RingGeometry(0.44, 0.55, 22),
};
for (const g of Object.values(GEO)) g.userData.shared = true;

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); g.userData.shared = true; geoCache.set(key, g); }
  return g;
}
const capGeo = (r, len) => cached(`cap:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 16));
const cylGeo = (rt, rb, h) => cached(`cyl:${rt}:${rb}:${h}`, () => new THREE.CylinderGeometry(rt, rb, h, 18));
const coneGeo = (r, h) => cached(`cone:${r}:${h}`, () => new THREE.ConeGeometry(r, h, 12));
const torusGeo = (r, tube) => cached(`torus:${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, 10, 24));

// Torso silhouette (lathe profile, waist -> neck base). Free Fire bodies are
// tapered, not boxy: wide shoulders, defined chest, narrower waist.
const TORSO_PROFILE = [
  [0.128, 0.000], [0.143, 0.050], [0.156, 0.130], [0.152, 0.220],
  [0.140, 0.300], [0.122, 0.365], [0.094, 0.415], [0.072, 0.445],
];
const torsoGeo = cached('torso', () => {
  const pts = TORSO_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 28);
});

// ---- deterministic look generation -----------------------------------------
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

const SKINS = [0xf1c8a5, 0xe3b285, 0xd29b6b, 0xc08552, 0x9c6b3f, 0x7c5230];
const HAIRS = [0x14100c, 0x241a10, 0x3b2a18, 0x54402a, 0x7a5a30, 0xb98a4a, 0xd0b060, 0xc23b2e, 0x8a8f9a, 0xd9d9de];
const SHIRTS = [0x2f6fe0, 0xe0453a, 0xe8a13a, 0x37a06b, 0x8a4fd0, 0xe9e4d8, 0x22304f, 0xe0689a, 0x2ec4c9, 0xf25c5c];
const PANTS = [0x232a3a, 0x3a3f4a, 0x4a5a3a, 0x5a4632, 0x2e3a5a, 0x303030, 0x453a4a];
const SHOES = [0xececec, 0x1c1c1e, 0x8a2a2a, 0x2a4a8a, 0x3a3a3a, 0xc7a35a];
const HAT_COLORS = [0x1f2a44, 0x8a2a2a, 0x2a4a8a, 0xe9e4d8, 0x2f2f33, 0x37a06b];
const PACK_COLORS = [0x4a5a3a, 0x303030, 0x5a4632, 0x22304f, 0x7a3b2e];

/** Same id -> same outfit, on every client. */
function outfitFor(id) {
  const rng = mulberry32(hashStr('blackwood:' + id));
  return {
    skin: pick(rng, SKINS),
    hairColor: pick(rng, HAIRS),
    hairStyle: pick(rng, ['short', 'spiky', 'buzz', 'bun']),
    hat: rng() < 0.45 ? { color: pick(rng, HAT_COLORS), style: rng() < 0.6 ? 'cap' : 'beanie' } : null,
    shirtColor: pick(rng, SHIRTS),
    shirtStyle: pick(rng, ['tee', 'hoodie', 'jacket']),
    pantsColor: pick(rng, PANTS),
    shoeColor: pick(rng, SHOES),
    pack: rng() < 0.55 ? pick(rng, PACK_COLORS) : null,
    glasses: rng() < 0.3,
  };
}

// ---- small builder helpers ---------------------------------------------------
function m(parent, geo, mtl, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(geo, mtl);
  mesh.position.set(x, y, z);
  if (sx !== 1 || sy !== 1 || sz !== 1) mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
// Standard (PBR-ish) materials read as much less "toy" than flat Lambert under
// the map's key + fill lighting. roughness per surface type.
const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...extra });
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
const hex3 = (hex) => '#' + hex.toString(16).padStart(6, '0');

// ---- painted face texture ----------------------------------------------------
// A canvas-painted face (eyes, brows, nose, mouth, cheek shading) mapped onto
// the head sphere. The -Z face of a three.js sphere sits at u = 0.75, so all
// features are drawn around (0.75 * W, ~0.46 * H).
const faceTexCache = new Map();
function faceTexture(skinHex, hairHex) {
  const key = skinHex + ':' + hairHex;
  let tex = faceTexCache.get(key);
  if (tex) return tex;
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const base = hex3(skinHex);
  const lcol = new THREE.Color(skinHex).multiplyScalar(1.16);
  lcol.r = Math.min(1, lcol.r); lcol.g = Math.min(1, lcol.g); lcol.b = Math.min(1, lcol.b);
  const light = hex3(lcol.getHex());
  const dark = hex3(new THREE.Color(skinHex).multiplyScalar(0.72).getHex());
  const hair = hex3(hairHex);
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  // vertical shading: crown lighter, jaw darker
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, light); g.addColorStop(0.45, base); g.addColorStop(1, dark);
  ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const cx = 0.75 * W, cy = 0.46 * H; // the -Z face centre
  // cheek warmth
  const cheek = ctx.createRadialGradient(cx, cy + 26, 4, cx, cy + 26, 60);
  cheek.addColorStop(0, 'rgba(255,110,85,0.16)'); cheek.addColorStop(1, 'rgba(255,110,85,0)');
  ctx.fillStyle = cheek; ctx.fillRect(cx - 90, cy - 20, 180, 110);
  // eyes — big and high-contrast so they read at 3-8 m of play distance
  for (const s of [-1, 1]) {
    const ex = cx + 31 * s, ey = cy - 6;
    ctx.fillStyle = 'rgba(25,18,14,0.45)';
    ctx.beginPath(); ctx.ellipse(ex, ey - 12, 17, 6, 0, 0, Math.PI * 2); ctx.fill(); // socket shadow
    ctx.fillStyle = '#f8f6f2';
    ctx.beginPath(); ctx.ellipse(ex, ey, 14, 9.5, 0, 0, Math.PI * 2); ctx.fill();   // white
    ctx.fillStyle = '#2a1c10';
    ctx.beginPath(); ctx.arc(ex, ey + 0.5, 6, 0, Math.PI * 2); ctx.fill();          // iris
    ctx.fillStyle = '#0a0605';
    ctx.beginPath(); ctx.arc(ex, ey + 0.5, 3.4, 0, Math.PI * 2); ctx.fill();        // pupil
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(ex - 2, ey - 2, 1.8, 0, Math.PI * 2); ctx.fill();      // glint
    ctx.strokeStyle = 'rgba(25,16,11,0.9)'; ctx.lineWidth = 3.5;                    // upper lid
    ctx.beginPath(); ctx.ellipse(ex, ey - 1.5, 14.5, 10, 0, Math.PI, Math.PI * 2); ctx.stroke();
  }
  // brows (dark, thick, slight angle)
  ctx.strokeStyle = hair; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 46, cy - 22); ctx.quadraticCurveTo(cx - 31, cy - 28, cx - 15, cy - 24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 46, cy - 22); ctx.quadraticCurveTo(cx + 31, cy - 28, cx + 15, cy - 24); ctx.stroke();
  // nose: soft shadow + highlight
  ctx.fillStyle = 'rgba(55,30,22,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 17, 6, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,225,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 10, 3.4, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  // mouth: neutral line + lower lip
  ctx.strokeStyle = 'rgba(65,30,26,0.85)'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(cx - 11, cy + 32); ctx.quadraticCurveTo(cx, cy + 35, cx + 11, cy + 32); ctx.stroke();
  ctx.fillStyle = 'rgba(255,215,200,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 39, 9, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  // sideburns hint near the seam edges is skipped (seam is mid-side, hair covers top)

  tex = new THREE.CanvasTexture(c);
  faceTexCache.set(key, tex);
  return tex;
}

export function createAvatar({ id, name, team, isSelf = false, isBot = false }) {
  const group = new THREE.Group();
  const out = outfitFor(id);
  const teamColor = TEAM_COLORS[team] ?? 0x9aa5b8;

  // ---------------- materials (per-avatar; disposed in dispose()) -----------
  const skinMat = mat(out.skin, { roughness: 0.6 });
  const hairMat = mat(out.hairColor, { roughness: 0.95 });
  const shirtMat = mat(out.shirtColor);
  const shirtDarkMat = mat(shade(out.shirtColor, 0.66));
  const pantsMat = mat(out.pantsColor);
  const bootMat = mat(out.shoeColor, { roughness: 0.55 });
  const soleMat = mat(out.shoeColor === 0xececec ? 0xb9bec7 : 0xf2f3f5, { roughness: 0.4 });
  const sockMat = mat(SOCK, { roughness: 0.9 });
  const darkMat = mat(DARK, { roughness: 0.4, metalness: 0.3 });
  const whiteMat = mat(WHITE, { roughness: 0.9 });
  const teamMat = mat(teamColor, { emissive: new THREE.Color(teamColor).multiplyScalar(0.25) });
  const glowMats = [shirtMat];
  const tintMats = [shirtMat, shirtDarkMat, pantsMat, bootMat, hairMat]; // found greys-out

  // ---------------- skeleton ---------------------------------------------------
  // Avatars face -Z at yaw 0 (see shared/geometry.js facingYaw()).
  const rig = new THREE.Group();          // bob / squash root (feet at y=0)
  group.add(rig);

  const hips = new THREE.Group();
  hips.position.y = 0.96;
  rig.add(hips);
  m(hips, GEO.sphere, pantsMat, 0, 0, 0, 0.14, 0.10, 0.11);   // pelvis (narrow)

  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(0.095 * side, 0, 0);
    hips.add(leg);
    m(leg, capGeo(0.078, 0.22), pantsMat, 0, -0.215, 0);      // thigh
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    leg.add(knee);
    m(knee, capGeo(0.062, 0.24), pantsMat, 0, -0.20, 0);      // shin
    m(knee, cylGeo(0.064, 0.064, 0.05), sockMat, 0, -0.355, 0); // sock cuff
    m(knee, GEO.sphere, bootMat, 0, -0.415, -0.02, 0.055, 0.045, 0.098); // shoe upper
    m(knee, GEO.sphere, soleMat, 0, -0.447, -0.025, 0.060, 0.022, 0.105); // sole
    return { leg, knee };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);

  const chest = new THREE.Group();
  chest.position.y = 0.33; // world y ≈ 1.29
  hips.add(chest);

  // tapered torso (lathe), flattened front-to-back
  const torso = m(chest, torsoGeo, shirtMat, 0, -0.30, 0, 1, 1, 0.74);
  // waist trim: belt + buckle + shirt hem
  m(chest, cylGeo(0.134, 0.134, 0.048), darkMat, 0, -0.295, 0, 1, 1, 0.8);     // belt
  m(chest, GEO.sphere, shirtDarkMat, 0, -0.29, -0.104, 0.034, 0.026, 0.014);   // buckle
  m(chest, cylGeo(0.131, 0.131, 0.04), shirtDarkMat, 0, -0.315, 0, 1, 1, 0.8); // hem

  // outfit details
  if (out.shirtStyle === 'hoodie') {
    m(chest, GEO.sphere, shirtDarkMat, 0, 0.36, 0.075, 0.115, 0.095, 0.105); // hood
    m(chest, GEO.sphere, shirtDarkMat, 0, -0.16, -0.105, 0.15, 0.085, 0.028); // pocket
    m(chest, cylGeo(0.0055, 0.0055, 0.085), whiteMat, -0.035, -0.145, -0.118); // drawstring
    m(chest, cylGeo(0.0055, 0.0055, 0.085), whiteMat, 0.035, -0.145, -0.118);
  } else if (out.shirtStyle === 'jacket') {
    m(chest, GEO.sphere, shirtDarkMat, 0, -0.03, -0.104, 0.015, 0.21, 0.013); // zipper (short)
    m(chest, cylGeo(0.088, 0.094, 0.06), shirtDarkMat, 0, 0.415, 0, 1, 1, 0.85); // collar
  }

  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(0.195 * side, 0.13, 0); // shoulder, world y ≈ 1.42
    chest.add(arm);
    m(arm, GEO.sphere, shirtMat, 0, 0.02, 0, 0.062, 0.058, 0.058);       // shoulder cap
    m(arm, capGeo(0.055, 0.15), shirtMat, 0, -0.11, 0);                  // sleeve
    if (out.shirtStyle === 'tee') {
      m(arm, cylGeo(0.058, 0.058, 0.045), shirtDarkMat, 0, -0.195, 0);   // cuff
    }
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    arm.add(elbow);
    const sleeveMat = out.shirtStyle === 'tee' ? skinMat : shirtMat;
    m(elbow, capGeo(0.048, 0.15), sleeveMat, 0, -0.11, 0);               // forearm
    m(elbow, GEO.sphere, skinMat, 0, -0.27, 0, 0.05, 0.052, 0.047);      // hand
    return { arm, elbow };
  }
  const armL = makeArm(-1), armR = makeArm(1);

  // team armband wrapping the right upper arm
  const band = m(armR.arm, torusGeo(0.062, 0.02), teamMat, 0, -0.10, 0);
  band.rotation.x = Math.PI / 2;

  // backpack (rounded pack + top pocket + straps)
  if (out.pack != null) {
    const packMat = mat(out.pack);
    m(chest, GEO.sphere, packMat, 0, -0.06, 0.13, 0.115, 0.15, 0.075);
    m(chest, GEO.sphere, mat(shade(out.pack, 0.65)), 0, 0.075, 0.12, 0.09, 0.055, 0.06);
    m(chest, GEO.sphere, packMat, -0.115, -0.05, -0.095, 0.022, 0.12, 0.018); // straps
    m(chest, GEO.sphere, packMat, 0.115, -0.05, -0.095, 0.022, 0.12, 0.018);
    tintMats.push(packMat);
  }

  // ---------------- head (smaller, with a real face) ---------------------------
  const headRoot = new THREE.Group();
  headRoot.position.y = 0.19; // world y ≈ 1.48
  chest.add(headRoot);
  m(headRoot, cylGeo(0.05, 0.055, 0.09), skinMat, 0, -0.02, 0);        // neck
  // head: painted face texture (eyes, brows, nose, mouth) mapped onto the
  // sphere — reads far more "real" at play distance than little spheres
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTexture(out.skin, out.hairColor), roughness: 0.62, metalness: 0,
  });
  const skull = m(headRoot, GEO.sphere, faceMat, 0, 0.13, 0, 0.15, 0.159, 0.145);
  // ears (3D, stick out slightly)
  m(headRoot, GEO.sphere, skinMat, -0.145, 0.11, 0, 0.019, 0.028, 0.026);
  m(headRoot, GEO.sphere, skinMat, 0.145, 0.11, 0, 0.019, 0.028, 0.026);

  function hair() {
    switch (out.hairStyle) {
      case 'buzz':
        m(headRoot, GEO.hemi, hairMat, 0, 0.19, 0.006, 0.152, 0.055, 0.15);
        break;
      case 'spiky':
        m(headRoot, GEO.hemi, hairMat, 0, 0.18, 0.008, 0.155, 0.10, 0.152);
        for (const [sx, h, tilt] of [[-0.07, 0.09, 0.42], [0, 0.12, 0], [0.07, 0.09, -0.42], [-0.035, 0.10, 0.18], [0.035, 0.10, -0.18]]) {
          const spike = m(headRoot, coneGeo(0.032, h), hairMat, sx, 0.27 + h / 2, 0.008);
          spike.rotation.z = tilt;
        }
        break;
      case 'bun':
        m(headRoot, GEO.hemi, hairMat, 0, 0.175, 0.008, 0.158, 0.115, 0.155);
        m(headRoot, GEO.sphere, hairMat, 0, 0.24, 0.12, 0.055, 0.055, 0.055); // bun
        break;
      case 'short':
      default:
        m(headRoot, GEO.hemi, hairMat, 0, 0.175, 0.008, 0.158, 0.125, 0.155);
        m(headRoot, GEO.sphere, hairMat, 0, 0.235, -0.105, 0.15, 0.045, 0.05); // fringe
        break;
    }
  }
  hair();

  if (out.hat) {
    const hatMat = mat(out.hat.color);
    if (out.hat.style === 'cap') {
      m(headRoot, GEO.hemi, hatMat, 0, 0.185, 0.006, 0.162, 0.115, 0.168);
      m(headRoot, GEO.sphere, hatMat, 0, 0.175, -0.155, 0.14, 0.016, 0.09); // brim
    } else {
      m(headRoot, GEO.hemi, hatMat, 0, 0.18, 0.006, 0.162, 0.12, 0.168);
      // folded band at the hairline (NOT over the face — an earlier revision
      // sat at mouth height and read as a ninja mask)
      const bb = m(headRoot, torusGeo(0.152, 0.032), mat(shade(out.hat.color, 0.7)), 0, 0.165, 0);
      bb.rotation.x = Math.PI / 2;
    }
    tintMats.push(hatMat);
  } else if (team === TEAMS.SEEKERS) {
    // seekers: orange goggle band + dark lenses
    const gb = m(headRoot, torusGeo(0.142, 0.016), mat(0xff6a3d, { emissive: new THREE.Color(0x552200) }), 0, 0.152, 0);
    gb.rotation.x = Math.PI / 2;
    m(headRoot, GEO.sphere, darkMat, -0.055, 0.152, -0.128, 0.036, 0.033, 0.018);
    m(headRoot, GEO.sphere, darkMat, 0.055, 0.152, -0.128, 0.036, 0.033, 0.018);
  } else if (out.glasses) {
    m(headRoot, GEO.sphere, darkMat, -0.055, 0.145, -0.132, 0.044, 0.042, 0.02);
    m(headRoot, GEO.sphere, darkMat, 0.055, 0.145, -0.132, 0.044, 0.042, 0.02);
    m(headRoot, GEO.sphere, darkMat, 0, 0.15, -0.138, 0.015, 0.006, 0.012); // bridge
  }

  // ---------------- static FX (must NOT bob with the gait) ----------------------
  const blob = new THREE.Mesh(GEO.circle,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  blob.scale.set(0.40, 0.40, 1);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);

  const ring = new THREE.Mesh(GEO.ring,
    new THREE.MeshBasicMaterial({ color: 0xff5b5b, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  // ---------------- nameplate ----------------------------------------------------
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 256; plateCanvas.height = 64;
  const plateTex = new THREE.CanvasTexture(plateCanvas);
  const plateMat = new THREE.SpriteMaterial({ map: plateTex, transparent: true, depthTest: false });
  const plate = new THREE.Sprite(plateMat);
  plate.scale.set(1.9, 0.475, 1);
  plate.position.y = 2.02;
  group.add(plate);

  const state = {
    id, name, team, isSelf, isBot,
    found: false, revealed: false, talking: false,
    effect: null, // 'boost' | 'cloak' | null (supply crate effects)
    sprint: false, // Feature 3: GOLD locked-sprint indicator on the character
    phase: 0, // gait phase (radians; 2π = one full stride pair)
  };

  function drawPlate() {
    const ctx = plateCanvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '700 26px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = `${state.talking ? '🎤 ' : ''}${name}${state.found ? ' (FOUND)' : ''}${isSelf ? ' (you)' : ''}`;
    ctx.fillStyle = 'rgba(8,10,16,0.6)';
    const w = Math.min(250, ctx.measureText(label).width + 26);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(128 - w / 2, 8, w, 48, 12);
    else ctx.rect(128 - w / 2, 8, w, 48);
    ctx.fill();
    ctx.fillStyle = state.found ? '#ffb0b0'
      : state.talking ? '#35d07f'
      : team === TEAMS.SEEKERS ? '#ffb894' : '#a9f5cd';
    ctx.fillText(label, 128, 33);
    plateTex.needsUpdate = true;
  }
  drawPlate();

  // ---------------- procedural gait --------------------------------------------
  // One damped pose per joint: targets are computed from gait phase / speed,
  // then exponentially smoothed, so walk <-> idle <-> air transitions never pop.
  const P = {
    legL: 0, kneeL: 0, legR: 0, kneeR: 0,
    armL: 0, elbowL: 0.25, armR: 0, elbowR: 0.25,
    chestX: -0.02, chestYaw: 0, chestZ: 0, hipYaw: 0, headX: 0,
    bob: 0,
  };
  let wasGrounded = true;
  let squash = 0;

  function dampTo(key, target, k) { P[key] += (target - P[key]) * k; }

  /**
   * @param {number} dt      seconds
   * @param {number} speed   m/s (horizontal)
   * @param {boolean} grounded
   * @param {number} jumpVy  vertical velocity m/s (for air stretch)
   */
  function animate(dt, speed, grounded, jumpVy) {
    const now = performance.now();
    const WALK = DEFAULT_CONFIG.walkSpeed;
    const SPRINT = DEFAULT_CONFIG.sprintSpeed;
    const moving = grounded && speed > 0.25;
    const running = speed > WALK + 0.4;
    const stride = running
      ? (DEFAULT_CONFIG.footstepStrideRunM ?? 2.1)
      : (DEFAULT_CONFIG.footstepStrideWalkM ?? 1.6);
    // gait frequency = real step frequency: one full cycle per two strides
    if (moving) state.phase += dt * speed * (Math.PI / stride);
    else state.phase += dt * 2.0;

    const φ = state.phase;
    const s = Math.sin(φ), c = Math.cos(φ);
    const t = Math.min(1, speed / WALK);
    const runT = Math.min(1, Math.max(0, (speed - WALK) / (SPRINT - WALK)));
    const legAmp = 0.42 * t + 0.42 * runT;
    const armAmp = legAmp * 0.8;

    let T;
    if (!grounded) {
      // air tuck: lead leg forward, trail leg back, arms up
      T = {
        legL: -0.5, kneeL: -0.7, legR: 0.35, kneeR: -0.25,
        armL: 0.5, elbowL: 0.9, armR: 0.3, elbowR: 0.9,
        chestX: -0.15, chestYaw: 0, chestZ: 0, hipYaw: 0, headX: 0.08, bob: 0,
      };
    } else if (moving) {
      // scissoring gait: arms oppose same-side legs, knees bend on the
      // forward swing, hips twist against the chest
      T = {
        legL: s * legAmp,
        kneeL: -Math.max(0, c) * 1.4 * legAmp,
        legR: -s * legAmp,
        kneeR: -Math.max(0, -c) * 1.4 * legAmp,
        armL: -s * armAmp + 0.12,
        elbowL: 0.35 + 0.5 * runT + 0.18 * Math.abs(c),
        armR: s * armAmp + 0.12,
        elbowR: 0.35 + 0.5 * runT + 0.18 * Math.abs(c),
        chestX: -(0.02 + Math.min(0.20, speed * 0.04)),
        chestYaw: -s * (0.05 + 0.08 * runT),
        chestZ: s * 0.05 * (0.4 + 0.6 * runT),
        hipYaw: s * (0.06 + 0.09 * runT),
        headX: Math.min(0.20, speed * 0.04) * 0.6,
        bob: Math.abs(Math.sin(φ)) * (0.035 + 0.03 * runT) * Math.max(t, runT),
      };
    } else {
      // idle: breathing + a hint of weight shift
      const br = Math.sin(now * 0.0022);
      T = {
        legL: 0, kneeL: 0.05, legR: 0, kneeR: 0.05,
        armL: 0.06 + br * 0.02, elbowL: 0.25 + 0.03 * br,
        armR: 0.06 - br * 0.02, elbowR: 0.25 + 0.03 * br,
        chestX: -0.02 + br * 0.008, chestYaw: 0, chestZ: 0, hipYaw: 0,
        headX: -br * 0.008,
        bob: 0.006 * (1 + br),
      };
    }

    // landing squash trigger
    if (grounded && !wasGrounded) squash = 1;
    wasGrounded = grounded;
    squash *= Math.exp(-dt * 9);

    const k = 1 - Math.exp(-dt * 14);
    for (const key of Object.keys(T)) dampTo(key, T[key], k);

    legL.leg.rotation.x = P.legL;  legL.knee.rotation.x = P.kneeL;
    legR.leg.rotation.x = P.legR;  legR.knee.rotation.x = P.kneeR;
    armL.arm.rotation.x = P.armL;  armL.elbow.rotation.x = P.elbowL;
    armR.arm.rotation.x = P.armR;  armR.elbow.rotation.x = P.elbowR;
    hips.rotation.y = P.hipYaw;
    chest.rotation.set(P.chestX, P.chestYaw, P.chestZ);
    headRoot.rotation.x = P.headX;
    rig.position.y = P.bob;

    let sy = 1 - 0.14 * squash;
    if (!grounded && jumpVy != null) sy += Math.max(-0.05, Math.min(0.07, jumpVy * 0.012));
    rig.scale.set(1, sy, 1);

    // ---- glow: scan ping / item effect / revealed shimmer / found grey -------
    const EFFECTS = { boost: [1.0, 0.72, 0.15], cloak: [0.2, 0.85, 1.0] };
    const pinged = state.pingUntil && now < state.pingUntil;
    if (pinged) {
      const p = 0.5 + 0.5 * Math.sin(now * 0.02);
      for (const m of glowMats) {
        m.emissive = m.emissive || new THREE.Color();
        m.emissive.setRGB(0.1 * p, 0.35 * p, 0.75 * p);
      }
      ring.material.color.setHex(0x5b8cff);
      ring.material.opacity = 0.35 + 0.5 * p;
    } else if (state.sprint && !state.found) {
      // Feature 3: GOLD glow = sprint is LOCKED on (Free Fire-style indicator).
      const p = 0.6 + 0.4 * Math.sin(now * 0.012);
      for (const m of glowMats) {
        m.emissive = m.emissive || new THREE.Color();
        m.emissive.setRGB(1.0 * p, 0.82 * p, 0.2 * p);
      }
      ring.material.color.setHex(0xffd166);
      ring.material.opacity = 0.3 + 0.25 * p;
    } else if (state.effect && EFFECTS[state.effect] && !state.found) {
      const [er, eg, eb] = EFFECTS[state.effect];
      const p = 0.45 + 0.4 * Math.sin(now * 0.008);
      for (const m of glowMats) {
        m.emissive = m.emissive || new THREE.Color();
        m.emissive.setRGB(er * p, eg * p, eb * p);
      }
      ring.material.color.setRGB(er, eg, eb);
      ring.material.opacity = 0.25 + 0.3 * p;
    } else if (state.revealed && !state.found) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      for (const m of glowMats) {
        m.emissive = m.emissive || new THREE.Color();
        m.emissive.setRGB(0.25 * pulse, 0.18 * pulse, 0.02 * pulse);
      }
    } else if (!state.found) {
      for (const m of glowMats) m.emissive?.setRGB(0, 0, 0);
      if (ring.material.opacity > 0) ring.material.opacity = 0;
    }
  }

  return {
    group, state, body: torso, head: skull,
    setPos(x, y, z) { group.position.set(x, y, z); },
    setRot(r) { group.rotation.y = r; },
    setFound() {
      if (state.found) return;
      state.found = true;
      for (const m of tintMats) m.color.set(FOUND_COLOR);
      ring.material.color.setHex(0xff5b5b);
      ring.material.opacity = 0.9;
      drawPlate();
    },
    setRevealed(on) { state.revealed = !!on; },
    /** Active supply-crate effect glow: 'boost' (gold) | 'cloak' (cyan) | null. */
    setEffect(kind) { state.effect = kind || null; },
    /** Feature 3: GOLD locked-sprint indicator on the character. */
    setSprint(on) { state.sprint = !!on; },
    setTalking(on) { if (state.talking !== on) { state.talking = !!on; drawPlate(); } },

    /** Scan-pulse contact marker: flare this avatar for a couple of seconds. */
    ping() { state.pingUntil = performance.now() + 2200; },

    animate,
    dispose(scene) {
      scene.remove(group);
      group.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) m?.dispose?.();
        }
      });
      plateTex.dispose();
      plateMat.dispose();
    },
  };
}
