/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Priestor sa nikdy nefarbí plnou farbou (AIM D-173, #298): krytie najviac 0,35.
 * Jedno miesto pre všetky cesty farieb do renderera (Lens pravidlá, `color_by`,
 * OR skupiny bez priesvitnej varianty, farby od používateľa, kolízie): volá ho
 * `useColorOverlaySync` tesne pred `scene.setColorOverrides`. Renderer farbu
 * s alfou kreslí ako nepriehľadnú zmes (D-125 doplnok), preto sa farba
 * priestoru z kanála vyradí a nesie ju podstava `AimRoomFill3d` s `FILL_ALPHA`
 * nepresahujúcou `SPACE_MAX_OPACITY`. Malý modul bez závislostí (eager).
 */

/** Najvyššie krytie farby priestoru (rozhodnutie Samuela, D-173). */
export const SPACE_MAX_OPACITY = 0.35;

/** Triedy, ktorých geometria sa nikdy nefarbí plnou farbou. */
const SPACE_CLASSES = new Set(['IfcSpace', 'IfcSpatialZone']);
export const isSpaceClass = (ifcType: string | undefined): boolean => !!ifcType && SPACE_CLASSES.has(ifcType);

type Rgba = readonly [number, number, number, number];

/**
 * Farby bez plne krycích farieb priestorov. Záznamy s alfou do stropu (duch
 * X-ray) ostanú; bez zásahu vráti ten istý objekt.
 */
export function withoutOpaqueSpaces<T extends Rgba>(colors: Map<number, T>, isSpace: (id: number) => boolean): Map<number, T> {
  let out: Map<number, T> | null = null;
  for (const [id, rgba] of colors) {
    if (rgba[3] > SPACE_MAX_OPACITY && isSpace(id)) {
      out ??= new Map(colors);
      out.delete(id);
    }
  }
  return out ?? colors;
}

/** Predikát "je to priestor" nad zoznamom mesh-ov (id -> trieda); `undefined` = bez geometrie. */
export function spacePredicate(meshes: Iterable<{ expressId: number; ifcType?: string }>): (id: number) => boolean {
  const ids = new Set<number>();
  for (const m of meshes) if (isSpaceClass(m.ifcType)) ids.add(m.expressId);
  return (id) => ids.has(id);
}
