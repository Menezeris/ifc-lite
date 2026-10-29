/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Nápoveda k orbitu v zamknutom pohľade zhora (AIMviewer#188). Počas kalibrácie podkladu (D-072)
 * je kamera zamknutá kolmo zhora a ťahanie myšou posúva namiesto otáčania; používateľ nevie prečo.
 * Pokus o orbit ukáže krátku nápovedu a Enter alebo medzerník (mimo vstupov) prepne do 3D.
 * Čisté rozhodnutia sú tu, store a toast sú v `useAimOrbitHint.ts`.
 */

/** Text nápovedy pri pokuse o orbit. */
export const ORBIT_HINT_TEXT = 'Stlač Enter alebo medzerník pre 3D';
/** Najmenší posun ťahania (px), od ktorého ide o pokus o orbit; kliknutie a jemné chvenie sa nepočíta. */
export const ORBIT_ATTEMPT_PX = 12;
/** Pauza medzi dvoma nápovedami (ms), aby neblikala pri každom ťahaní. */
export const ORBIT_HINT_COOLDOWN_MS = 6000;

/** Stav, z ktorého sa rozhoduje: zámok kamery a bežiaca kalibrácia (rovnaká podmienka ako vetva "posun namiesto orbitu"). */
export interface OrbitLockState {
  underlayViewLocked: boolean;
  underlayCalibration: unknown | null;
}

/** Orbit je zámkom kamery zablokovaný (ťahanie posúva): zamknutý pôdorys počas kalibrácie. */
export function orbitBlocked(s: OrbitLockState): boolean {
  return s.underlayViewLocked && s.underlayCalibration !== null;
}

/** Ukázať nápovedu: orbit je zablokovaný, ťahanie už nie je kliknutie a od poslednej nápovedy ubehla pauza. */
export function shouldShowOrbitHint(blocked: boolean, draggedPx: number, now: number, lastShownAt: number | null): boolean {
  if (!blocked || draggedPx < ORBIT_ATTEMPT_PX) return false;
  return lastShownAt === null || now - lastShownAt >= ORBIT_HINT_COOLDOWN_MS;
}

/** Čo o klávese a jej cieli treba vedieť (podmnožina `KeyboardEvent`). */
export interface SwitchKeyEvent {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  /** `EventTarget` z `KeyboardEvent`; čítajú sa z neho `tagName` a `isContentEditable`. */
  target: object | null;
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']);

/**
 * Enter alebo medzerník prepne do 3D, ale len mimo vstupov (a tlačidiel s vlastným významom Enter/medzerníka),
 * bez modifikátorov a nie pri opakovaní klávesu.
 */
export function isSwitchTo3dKey(blocked: boolean, e: SwitchKeyEvent): boolean {
  if (!blocked || e.repeat || e.defaultPrevented) return false;
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (t?.isContentEditable) return false;
  return !(t?.tagName && TYPING_TAGS.has(t.tagName.toUpperCase()));
}
