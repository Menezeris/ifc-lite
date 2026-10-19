/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Obálka, voči ktorej renderer naozaj reže (AIM #63). Percento rezu
 * (`SectionPlane.position`) renderer rozkladá na rozsah z
 * `usePlacementCoordinateInfo` (živé obálky modelov zo scény), nie na holé
 * `mergedSectionBounds`. Pri federácii ASR + VZT sú tieto dve obálky rôzne
 * veľké, takže rez prepočítaný voči holej obálke padol inam (sklon 0,486,
 * #63) a spätné čítanie hlásilo inú výšku, než ukazoval Section bar.
 * Rovnaký postup ako `useSectionDistance` (Section bar), bez Reactu.
 * `placementCoordinateInfo` dodá volajúci (`useAimViewCommands.ts`): jeho
 * import ťahá zbuildované balíky, ktoré rýchle AIM testy nemajú.
 */

import type { CoordinateInfo } from '@ifc-lite/geometry';
import type { useViewerStore } from '@/store';
import { mergedSectionBounds, type AxisBounds } from '@/lib/section/section-distance';
import type { placementCoordinateInfo } from '@/lib/section/placement-coordinate-info';

type State = Pick<ReturnType<typeof useViewerStore.getState>, 'models' | 'geometryResult' | 'modelPlacement'>;

/** Obálka rezu v render rámci, tá istá ako pri Section bare a rendereri; null kým nie je nič načítané. */
export function sectionRenderBounds(state: State, place: typeof placementCoordinateInfo): AxisBounds | null {
  const merged = mergedSectionBounds(state.models, state.geometryResult);
  if (!merged) return null;
  let base: CoordinateInfo | undefined;
  for (const model of state.models.values()) {
    if (model.visible && model.geometryResult?.coordinateInfo) { base = model.geometryResult.coordinateInfo; break; }
  }
  base ??= state.geometryResult?.coordinateInfo;
  // mergedSectionBounds skladá tie isté viditeľné modely (alebo legacy výsledok), takže bez `base` by bolo aj `merged` null.
  if (!base) return null;
  // `place` vráti undefined len pre undefined zdroj; holá obálka sa nevracia nikdy (#63).
  return place({ ...base, shiftedBounds: merged }, state.models, state.modelPlacement)?.shiftedBounds ?? null;
}
