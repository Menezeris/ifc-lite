/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PDF podklad pod vodorovným rezom (AIM D-161). Rovina rezu podklady neorezáva a
 * podklad je v hĺbke testovaný len voči modelu, takže pri pohľade zhora na rezané podlažie
 * (`mode=2d`, `set_section` + `set_camera top`) podklad vyššieho podlažia, ktorý leží nad rezom,
 * prekryl pôdorys pod ním. Pravidlo je odvodené zo scény (výška rezu a výšky podlaží kalibrovaných
 * podkladov), nie z metadát pohľadu: pri aktívnom vodorovnom reze sa kreslí len podklad
 * najbližšieho podlažia pod rezom (pri otočenom reze, pohľade zdola, najbližšieho nad ním).
 * Bez vodorovného rezu a počas kalibrácie sa nefiltruje nič. Čisté funkcie bez store (test).
 */

import { percentToWorld, sectionAxisRange, type AxisBounds } from '@/lib/section/section-distance';

/** Tolerancia zhody výšok podlaží (m): podklady jedného podlažia majú rovnaké `storeyZ`. */
const SAME_LEVEL_M = 0.005;

/**
 * Výška podlažia (IFC Z, m), ktorého podklad sa kreslí pri reze vo výške `cutZ`, alebo null,
 * keď sa nefiltruje (bez rezu, bez podkladov, žiadne podlažie na tej strane rezu). Rez presne
 * na úrovni podlažia patrí tomuto podlažiu (s toleranciou 1 cm).
 */
export function storeyZToDraw(storeyZs: readonly number[], cutZ: number | null, flipped: boolean): number | null {
  if (cutZ === null || storeyZs.length === 0) return null;
  let best: number | null = null;
  for (const z of storeyZs) {
    if (flipped ? z < cutZ - 0.01 : z > cutZ + 0.01) continue;
    if (best === null || (flipped ? z < best : z > best)) best = z;
  }
  return best;
}

/** Kreslí sa podklad s výškou `storeyZ`? `draw` = výsledok `storeyZToDraw`; null = bez filtra (kreslí sa všetko). */
export const underlayAtLevel = (storeyZ: number, draw: number | null): boolean => draw === null || Math.abs(storeyZ - draw) <= SAME_LEVEL_M;

/** Výška aktívneho vodorovného rezu v IFC Z (m) z polohy v % obálky a posunu rámca; null pre iný rez alebo bez obálky. */
export function horizontalCutZ(
  plane: { axis: string; position: number; box?: unknown } | null,
  bounds: AxisBounds | null,
  offsetY: number,
): number | null {
  if (!plane || plane.axis !== 'down' || plane.box) return null;
  const range = sectionAxisRange(bounds, 'down');
  return range ? percentToWorld(plane.position, range) + offsetY : null;
}
