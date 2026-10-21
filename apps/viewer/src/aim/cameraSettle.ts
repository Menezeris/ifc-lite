/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `APPLIED` po príkaze s pohybom kamery (obnova pohľadu, reset, preset) hlásil kameru počas
 * animácie, nie jej cieľ (AIM #97, overenie D-122). Pred zostavením stavu sa preto počká, kým
 * sa póza ustáli: dve vzorky po sebe bez zmeny. Animácie trvajú 300 až 600 ms; horný limit
 * zabráni čakaniu donekonečna (napr. používateľ práve otáča kamerou). Bez store, kvôli testu.
 */

export interface PoseSample {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export interface SettleOptions {
  stepMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const CAMERA_SETTLE_STEP_MS = 50;
export const CAMERA_SETTLE_MAX_MS = 1000;
const EPS = 1e-4;

const near = (a: PoseSample['position'], b: PoseSample['position']) =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.z - b.z) < EPS;

/** true = póza sa ustálila (alebo kamera nie je), false = limit vypršal počas pohybu. */
export async function waitCameraSettled(read: () => PoseSample | null | undefined, opts: SettleOptions = {}): Promise<boolean> {
  const step = opts.stepMs ?? CAMERA_SETTLE_STEP_MS;
  const max = opts.maxMs ?? CAMERA_SETTLE_MAX_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  let prev = read();
  if (!prev) return true;
  const start = now();
  while (now() - start < max) {
    await sleep(step);
    const cur = read();
    if (!cur) return true;
    if (near(prev.position, cur.position) && near(prev.target, cur.target)) return true;
    prev = cur;
  }
  return false;
}
