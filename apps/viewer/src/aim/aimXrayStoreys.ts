/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Kontext X-ray len pre zvolené podlažia (AIM D-140, #187): store lepidlo k `aimXrayStoreysPlan.ts`.
 * Ostatné podlažia sa skryjú kanálom skrytia viewera (`hiddenEntities`) a chat si pamätá, čo skryl
 * sám, aby X-ray z chatu pri zrušení vrátil len tie prvky (ručné skrytie používateľa ostane).
 * Načítava sa lenivo z `aimLens.ts`.
 */

import { resolvePresentationIds } from '@/lib/presentation/resolvePresentationIds';
import { useViewerStore } from '@/store';
import { toGlobalIdFromModels } from '@/store/globalId';
import { idsOutsideStoreys, type StoreyModel } from './aimXrayStoreysPlan.js';

type State = ReturnType<typeof useViewerStore.getState>;

/** Podlažia všetkých načítaných modelov s ich prvkami (priamo obsiahnutými aj cez miestnosť). */
function storeyModels(state: State): StoreyModel[] {
  const out: StoreyModel[] = [];
  for (const [modelId, model] of state.models) {
    const store = model.ifcDataStore;
    const hierarchy = store?.spatialHierarchy;
    if (!store || !hierarchy) continue;
    const buckets = [...hierarchy.byStorey].map(([storeyId, direct]) => {
      const members = new Set(direct);
      // Miestnosť podlažia a prvky v nej (`bySpace`) patria podlažiu rovnako ako pravidlo `storey` v Lens.
      for (const [spaceId, elements] of hierarchy.bySpace ?? []) {
        if (hierarchy.elementToStorey.get(spaceId) !== storeyId) continue;
        members.add(spaceId);
        for (const id of elements) members.add(id);
      }
      return { name: store.entities.getName(storeyId), members: [...members] };
    });
    out.push({ buckets, toGlobal: (expressId) => toGlobalIdFromModels(state.models, modelId, expressId) });
  }
  return out;
}

/** Skryje prvky podlaží mimo kontextu; vráti id, ktoré skryl NOVO (tie sa pri zrušení vrátia). */
export function hideOutsideStoreys(wanted: readonly string[], keep: ReadonlySet<number>): number[] {
  const state = useViewerStore.getState();
  // Zostavy (IfcElementAssembly) nemajú vlastnú geometriu: skryť treba ich časti, rovnako ako Lens (#3338).
  const outside = resolvePresentationIds(state.cameraCallbacks.resolveHighlightIds, idsOutsideStoreys(storeyModels(state), wanted, keep));
  const owned = outside.filter((id) => !state.hiddenEntities.has(id));
  if (owned.length > 0) state.hideEntities(owned);
  return owned;
}

/** Vráti prvky, ktoré skrylo X-ray z chatu a ktoré sú stále skryté (ručné odkrytie nechá tak). */
export function restoreHidden(owned: readonly number[] | undefined): void {
  if (!owned || owned.length === 0) return;
  const state = useViewerStore.getState();
  const still = owned.filter((id) => state.hiddenEntities.has(id));
  if (still.length > 0) state.showEntities(still);
}
