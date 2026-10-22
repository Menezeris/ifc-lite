/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Plynulé otáčanie kamery dokola (AIM #247): `AUTO_ROTATE start` z chatu rozbehne slučku po snímkoch, ktorá cez
 * existujúci `cameraCallbacks.applyViewpoint` otáča pohľad okolo cieľa; matematika je v `autoRotatePlan.ts`.
 * Zastaví ho `AUTO_ROTATE stop`, ťah, koliesko alebo dotyk na plátne, Esc a každý iný pohyb kamery (ViewCube,
 * ďalší príkaz kamery). Lenivý modul - vo vstupnom balíku nie je a nič z vstupu neimportuje.
 */

import { useViewerStore } from '@/store';
import { poseMoved, rotationAngle, stepPose, type AutoRotateDirection } from './autoRotatePlan.js';

export interface AutoRotateHooks {
  /** Zlyhanie kroku (ide do `APPLIED.issues`). */
  noteIssue: (message: string) => void;
  /** Slučka skončila sama (zásah používateľa, iná kamera); nevolá sa pri `stopAutoRotate` ani novom štarte. */
  onEnded: () => void;
}

let stopCurrent: ((notify: boolean) => void) | null = null;

export const isAutoRotating = (): boolean => stopCurrent !== null;

export function stopAutoRotate(): void {
  stopCurrent?.(false);
}

/** Rozbehne otáčanie (nahradí bežiace); false = kamera nie je pripravená. */
export function startAutoRotate(speedDegS: number, direction: AutoRotateDirection, hooks: AutoRotateHooks): boolean {
  const cam = () => useViewerStore.getState().cameraCallbacks;
  const read = () => cam().getViewpoint?.() ?? null;
  const first = read();
  if (!first || !cam().applyViewpoint) {
    hooks.noteIssue('AUTO_ROTATE: kamera viewera ešte nie je pripravená');
    return false;
  }
  stopCurrent?.(false);

  let last = first;
  let prev = performance.now();
  let raf = 0;
  const onUser = (e: Event) => {
    if (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' : e.target instanceof HTMLCanvasElement) stop(true);
  };
  const EVENTS = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const;
  const stop = (notify: boolean) => {
    cancelAnimationFrame(raf);
    for (const t of EVENTS) window.removeEventListener(t, onUser, true);
    stopCurrent = null;
    if (notify) hooks.onEnded();
  };
  const tick = (now: number) => {
    const cur = read();
    // Kamera zmizla alebo sa pohla inak než naším krokom: používateľ alebo iný príkaz ju prevzal.
    if (!cur || poseMoved(last, cur)) return stop(true);
    const next = stepPose(cur, rotationAngle(speedDegS, direction, now - prev));
    prev = now;
    cam().applyViewpoint?.(next, false);
    last = read() ?? next;
    raf = requestAnimationFrame(tick);
  };
  for (const t of EVENTS) window.addEventListener(t, onUser, { capture: true, passive: true });
  stopCurrent = stop;
  raf = requestAnimationFrame(tick);
  return true;
}
