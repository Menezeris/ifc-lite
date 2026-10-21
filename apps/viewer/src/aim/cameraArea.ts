/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Časť cieľa podľa smeru pohľadu (AIM D-128, AIMviewer#172): "atika na ľavej
 * strane" = z cieľových prvkov tie, ktorých stred leží v ľavej tretine ich
 * spoločnej obálky na obrazovke. Čisté výpočty nad obálkami a osami kamery v
 * render rámci, bez store; vykonanie je v `viewCamera.ts`.
 */

import type { Box3, Vec3 } from './viewFrame.js';
import type { CameraArea } from './view-protocol.js';

/** Osi obrazu v render rámci: doprava, hore a smer pohľadu (od kamery). */
export interface ScreenAxes { right: Vec3; up: Vec3; forward: Vec3 }

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Osi obrazu z pózy kamery; degenerovaná póza (kamera v cieli, `up` v smere pohľadu) = null. */
export function screenAxes(pose: { position: Vec3; target: Vec3; up: Vec3 }): ScreenAxes | null {
  const f = sub(pose.target, pose.position);
  if (Math.hypot(f.x, f.y, f.z) < 1e-9) return null;
  const forward = norm(f);
  const r = cross(forward, pose.up);
  if (Math.hypot(r.x, r.y, r.z) < 1e-9) return null;
  const right = norm(r);
  return { right, up: norm(cross(right, forward)), forward };
}

/** Os a strana pre časť: left = malé hodnoty na osi doprava, front = bližšie ku kamere. */
const AREA_AXIS: Record<CameraArea, { axis: keyof ScreenAxes; high: boolean }> = {
  left: { axis: 'right', high: false },
  right: { axis: 'right', high: true },
  bottom: { axis: 'up', high: false },
  top: { axis: 'up', high: true },
  front: { axis: 'forward', high: false },
  back: { axis: 'forward', high: true },
};

/** Rozsah obálky na osi: stred +- polovice rozmerov premietnuté na os. */
function span(box: Box3, axis: Vec3): { lo: number; hi: number; mid: number } {
  const c = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
  const h = { x: (box.max.x - box.min.x) / 2, y: (box.max.y - box.min.y) / 2, z: (box.max.z - box.min.z) / 2 };
  const mid = dot(c, axis);
  const r = Math.abs(axis.x) * h.x + Math.abs(axis.y) * h.y + Math.abs(axis.z) * h.z;
  return { lo: mid - r, hi: mid + r, mid };
}

/**
 * Indexy obálok v danej časti: stred v krajnej tretine spoločného rozsahu na osi.
 * Prvok cez celú šírku (atika na prednej strane) má stred v strede a do ľavej
 * tretiny nepatrí. Keď v tretine nie je nič, vráti prvok so stredom najbližšie k
 * okraju, aby rámovanie nikdy neostalo prázdne.
 */
export function pickArea(boxes: readonly Box3[], area: CameraArea, axes: ScreenAxes): number[] {
  if (boxes.length <= 1) return boxes.map((_, i) => i);
  const { axis, high } = AREA_AXIS[area];
  const spans = boxes.map((b) => span(b, axes[axis]));
  const lo = Math.min(...spans.map((s) => s.lo));
  const hi = Math.max(...spans.map((s) => s.hi));
  const third = (hi - lo) / 3;
  const picked = spans.flatMap((s, i) => ((high ? s.mid >= hi - third : s.mid <= lo + third) ? [i] : []));
  if (picked.length > 0) return picked;
  let best = 0;
  spans.forEach((s, i) => {
    if (high ? s.mid > spans[best].mid : s.mid < spans[best].mid) best = i;
  });
  return [best];
}
