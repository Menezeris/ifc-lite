/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zrušenie oranžového zvýraznenia z `FOCUS` v UI (AIM #94): klik do scény bez ťahania
 * a Esc. Zvýraznenie nie je výber, takže klik do prázdna pri prázdnom výbere nič nezmení
 * v store; preto sa gestá sledujú priamo. Čistá logika bez DOM, aby sa dala testovať.
 */

/** Najväčší posun myši medzi stlačením a pustením, ktorý ešte platí ako klik (nie orbit ani pan). */
export const CLICK_SLOP_PX = 5;

export interface PointerPoint {
  x: number;
  y: number;
}

/** Klik = pustenie blízko miesta stlačenia; ťah kamerou zvýraznenie nezruší. */
export function isClickGesture(down: PointerPoint, up: PointerPoint): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_SLOP_PX;
}

/** Klávesa, ktorá zruší zvýraznenie: samotné Esc mimo textového poľa (tam patrí úprave textu). */
export function isDismissKey(key: string, inTextEntry: boolean): boolean {
  return key === 'Escape' && !inTextEntry;
}

/** Cieľ gesta je plátno scény (3D viewport), nie panel ani menu nad ním. */
export function isSceneTarget(tagName: string | null | undefined): boolean {
  return (tagName ?? '').toUpperCase() === 'CANVAS';
}
