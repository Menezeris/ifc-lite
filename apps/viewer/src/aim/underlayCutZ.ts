/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výška aktívneho vodorovného rezu zo store pre `useDrawingUnderlay` (AIM D-161): čítanie obálky
 * rezu a posunu rámca; výpočet a pravidlo sú v čistom `underlayAtCut.ts`.
 */

import type { useViewerStore } from '@/store';
import { activeSectionPlane } from '@/store/section-active';
import { totalYupOffset } from '@/lib/geo/coordinate-frame';
import { placementCoordinateInfo } from '@/lib/section/placement-coordinate-info';
import { sectionRenderBounds } from './sectionRange.js';
import { horizontalCutZ } from './underlayAtCut.js';

type State = ReturnType<typeof useViewerStore.getState>;

/** IFC Z (m) aktívneho vodorovného rezu, alebo null (iný rez, bez rezu, bez obálky); výber zo store beží pri každej zmene, preto najprv lacná kontrola. */
export function aimHorizontalCutZ(state: State): number | null {
  const plane = activeSectionPlane(state);
  if (!plane || plane.axis !== 'down' || plane.box) return null;
  const first = [...state.models.values()].find((m) => m.geometryResult?.coordinateInfo);
  const offY = totalYupOffset((first?.geometryResult ?? state.geometryResult)?.coordinateInfo).y;
  return horizontalCutZ(plane, sectionRenderBounds(state, placementCoordinateInfo), offY);
}
