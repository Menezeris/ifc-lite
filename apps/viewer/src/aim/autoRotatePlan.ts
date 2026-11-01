/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Plynulé otáčanie kamery dokola (AIM #247, `AUTO_ROTATE` z chatu): čistá matematika bez store a DOM.
 * Beh po snímkoch a zastavenie pri zásahu používateľa je v `autoRotate.ts`.
 *
 * Otáča sa kamera okolo zvislej osi (render rámec, Y hore) cez `target` aktuálneho pohľadu, rovnako ako
 * ťah myšou vodorovne. (Kontrola šumu E2E 1: komentár.) Smer `left` zodpovedá kladnému `orbit_h_deg` hosta: kamera obieha cieľ doľava
 * (zhora v smere hodinových ručičiek).
 */

export const AUTO_ROTATE_ACTIONS = ['start', 'stop'] as const;
export type AutoRotateAction = (typeof AUTO_ROTATE_ACTIONS)[number];
export const AUTO_ROTATE_DIRECTIONS = ['left', 'right'] as const;
export type AutoRotateDirection = (typeof AUTO_ROTATE_DIRECTIONS)[number];
/** Rýchlosť v stupňoch za sekundu - rovnaký rozsah ako host (`lib/viewer-camera.ts`). */
export const AUTO_ROTATE_SPEED = { min: 0.5, max: 90, default: 10 } as const;
/** Najdlhší krok medzi snímkami: po návrate z pozadia sa kamera neskočí o celé sekundy. */
export const MAX_STEP_MS = 100;

export interface Vec3 { x: number; y: number; z: number }
export interface Pose { position: Vec3; target: Vec3; up: Vec3 }

/** Uhol otočenia okolo +Y v radiánoch za `dtMs`; `left` je záporný (zhora v smere hodinových ručičiek). */
export function rotationAngle(speedDegS: number, direction: AutoRotateDirection, dtMs: number): number {
  const dt = Math.max(0, Math.min(dtMs, MAX_STEP_MS));
  const rad = (speedDegS * Math.PI / 180) * (dt / 1000);
  return direction === 'left' ? -rad : rad;
}

/** Pravotočivá rotácia okolo +Y (rovnaká konvencia ako `animateHorizontalRotation` vo Viewporte). */
export function rotateAboutY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

/** Pohľad po otočení o `angle` okolo zvislej osi cez `target`; `up` sa otočí s ním (pohľad zhora sa tak točí v rovine). */
export function stepPose<T extends Pose>(vp: T, angle: number): T {
  const offset = rotateAboutY({
    x: vp.position.x - vp.target.x, y: vp.position.y - vp.target.y, z: vp.position.z - vp.target.z,
  }, angle);
  return {
    ...vp,
    position: { x: vp.target.x + offset.x, y: vp.target.y + offset.y, z: vp.target.z + offset.z },
    up: rotateAboutY(vp.up, angle),
  };
}

const REL_EPS = 1e-4;

/** Pohla sa kamera inak než naším krokom (ťah, ViewCube, iný príkaz)? Tolerancia sa mierou vzdialenosti. */
export function poseMoved(expected: Pose, actual: Pose): boolean {
  const dist = Math.hypot(
    expected.position.x - expected.target.x, expected.position.y - expected.target.y, expected.position.z - expected.target.z,
  );
  const eps = REL_EPS * Math.max(dist, 1);
  const far = (a: Vec3, b: Vec3) => Math.abs(a.x - b.x) > eps || Math.abs(a.y - b.y) > eps || Math.abs(a.z - b.z) > eps;
  return far(expected.position, actual.position) || far(expected.target, actual.target);
}
