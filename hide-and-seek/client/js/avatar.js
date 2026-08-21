// ============================================================================
// client/js/avatar.js — stylized player characters (lightweight primitives,
// clear silhouettes) with procedural animation states and a dynamic nameplate.
// ============================================================================

import * as THREE from 'three';
import { TEAMS } from '../../shared/constants.js';

const TEAM_COLORS = { [TEAMS.HIDERS]: 0x35d07f, [TEAMS.SEEKERS]: 0xff6a3d };
const FOUND_COLOR = 0xb9c0cc;

export function createAvatar({ id, name, team, isSelf = false, isBot = false }) {
  const group = new THREE.Group();
  const color = new THREE.Color(TEAM_COLORS[team] ?? 0x9aa5b8);

  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const headMat = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(1.35) });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.55, 4, 10), bodyMat);
  body.position.y = 0.85;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 10), headMat);
  head.position.y = 1.48;
  group.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.09, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x10141f }),
  );
  visor.position.set(0, 1.5, -0.21);
  group.add(visor);

  // little backpack so direction is readable from behind
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.4, 0.16),
    new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.55) }),
  );
  pack.position.set(0, 1.0, 0.3);
  group.add(pack);

  // fake soft shadow blob
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);

  // found marker ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.55, 20),
    new THREE.MeshBasicMaterial({ color: 0xff5b5b, transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  // nameplate sprite
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 256; plateCanvas.height = 64;
  const plateTex = new THREE.CanvasTexture(plateCanvas);
  const plateMat = new THREE.SpriteMaterial({ map: plateTex, transparent: true, depthTest: false });
  const plate = new THREE.Sprite(plateMat);
  plate.scale.set(1.9, 0.475, 1);
  plate.position.y = 2.05;
  group.add(plate);

  const state = {
    id, name, team, isSelf, isBot,
    found: false, revealed: false, talking: false,
    phase: 0, // walk cycle
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

  return {
    group, state, body, head,
    setPos(x, y, z) { group.position.set(x, y, z); },
    setRot(r) { group.rotation.y = r; },
    setFound() {
      if (state.found) return;
      state.found = true;
      bodyMat.color.set(FOUND_COLOR);
      headMat.color.set(FOUND_COLOR);
      ring.material.opacity = 0.9;
      drawPlate();
    },
    setRevealed(on) { state.revealed = !!on; },
    setTalking(on) { if (state.talking !== on) { state.talking = !!on; drawPlate(); } },

    /** procedural anim: bob + lean + squash by speed & airborne */
    animate(dt, speed, grounded, jumpVy) {
      state.phase += dt * (2 + speed * 2.6);
      if (!grounded) {
        const stretch = Math.max(-0.25, Math.min(0.3, jumpVy * 0.03));
        body.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
        head.position.y = 1.48 + stretch * 0.2;
        return;
      }
      const bob = Math.abs(Math.sin(state.phase)) * Math.min(speed / 5.8, 1) * 0.09;
      body.position.y = 0.85 + bob;
      head.position.y = 1.48 + bob * 1.15;
      body.rotation.x = Math.min(speed / 12, 0.16);
      body.scale.set(1, 1, 1);
      // reveal shimmer for hidden-but-detected enemies
      if (state.revealed && !state.found) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
        bodyMat.emissive = bodyMat.emissive || new THREE.Color();
        bodyMat.emissive.setRGB(0.25 * pulse, 0.18 * pulse, 0.02 * pulse);
      } else if (!state.found) {
        bodyMat.emissive?.setRGB(0, 0, 0);
      }
    },
    dispose(scene) {
      scene.remove(group);
      body.geometry.dispose(); head.geometry.dispose();
      plateTex.dispose();
    },
  };
}
