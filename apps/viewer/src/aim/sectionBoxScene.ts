/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Box cut zo scény (AIM, "Box cut" ako v Daluxe): box okolo výberu s okrajom
 * podľa jeho veľkosti, pre miestnosť (IfcSpace) od podlahovej po stropnú dosku
 * a vodorovne s okolitými stenami. Matematika je v `sectionBoxFit.ts`; tu je
 * len zber obálok z renderera a zápis boxu do store.
 */

import { useViewerStore } from '@/store';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { toGlobalIdFromModels } from '@/store/globalId';
import { resolveEntityRef } from '@/store/resolveEntityRef';
import { leaveAlignmentMode } from '@/lib/section/alignment-controller';
import { sectionBoxFromBounds } from '@/lib/section/section-box';
import { createPlacedEntityBoundsLookup } from '@/lib/model-placement/selection-bounds';
import type { SectionBox } from '@/store/types';
import { boxAround, sectionBoxForSpace, type FitBox, type FitCandidate, type FitKind } from './sectionBoxFit.js';

const TYPES: ReadonlyArray<readonly [string, FitKind]> = [
  ['IFCSLAB', 'slab'], ['IFCROOF', 'slab'],
  ['IFCWALL', 'wall'], ['IFCWALLSTANDARDCASE', 'wall'], ['IFCCURTAINWALL', 'wall'],
];

type State = ReturnType<typeof useViewerStore.getState>;
type Scene = NonNullable<ReturnType<NonNullable<ReturnType<typeof getGlobalRenderer>>['getScene']>>;

const toFit = (b: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): FitBox => ({ min: { ...b.min }, max: { ...b.max } });
const toTuple = (b: FitBox): SectionBox => ({ min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
type Bounds = (id: number) => FitBox | null;

/**
 * Obálky prvkov: najprv scéna renderera, potom siete `geometryResult` (miestnosti
 * sú predvolene skryté, preto ich renderer nedrží): tá istá cesta ako Frame
 * (`createPlacedEntityBoundsLookup`, so zahrnutým posunom modelu). Jeden
 * vyhľadávač na celý výpočet, ktorý sa sám zaindexuje, nie sken sietí na prvok.
 */
function boundsLookup(state: State, scene: Scene | undefined): Bounds {
  const meshes = state.geometryResult?.meshes ?? [...state.models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const fromMeshes = createPlacedEntityBoundsLookup(meshes.length > 0 ? meshes : null);
  return (id) => {
    const b = scene?.getEntityBoundingBox(id) ?? scene?.getInstancedEntityBounds(id) ?? fromMeshes(id);
    return b ? toFit(b) : null;
  };
}

/** Obálky dosiek a stien modelu miestnosti (render rám). Prvky bez geometrie sa preskočia. */
function collectCandidates(state: State, boundsOf: Bounds, modelId: string): FitCandidate[] {
  const store = modelId === 'legacy' ? state.ifcDataStore : state.models.get(modelId)?.ifcDataStore;
  if (!store) return [];
  const out: FitCandidate[] = [];
  for (const [type, kind] of TYPES) {
    for (const expressId of store.entityIndex.byType.get(type) ?? []) {
      const b = boundsOf(toGlobalIdFromModels(state.models, modelId, expressId));
      if (b) out.push({ kind, ...b });
    }
  }
  return out;
}

/** Box pre výber `ids` (globálne id): miestnosť so skladbami, inak obálka s okrajom podľa veľkosti. */
export function sectionBoxForEntities(ids: readonly number[], fallback?: FitBox | null): SectionBox | null {
  const state = useViewerStore.getState();
  const boundsOf = boundsLookup(state, getGlobalRenderer()?.getScene());
  if (ids.length === 1) {
    const ref = resolveEntityRef(ids[0]);
    const store = ref.modelId === 'legacy' ? state.ifcDataStore : state.models.get(ref.modelId)?.ifcDataStore;
    const space = store && store.entities.getTypeName(ref.expressId).toUpperCase() === 'IFCSPACE' ? boundsOf(ids[0]) : null;
    if (space) {
      const fit = sectionBoxForSpace(space, collectCandidates(state, boundsOf, ref.modelId));
      const box = fit && sectionBoxFromBounds({ min: { x: fit.box.min.x, y: fit.box.min.y, z: fit.box.min.z }, max: { x: fit.box.max.x, y: fit.box.max.y, z: fit.box.max.z } });
      if (box) return box;
    }
  }
  const bounds = ids.length > 0
    ? union(ids.map(boundsOf).filter((b): b is FitBox => b !== null))
    : fallback ?? null;
  const around = bounds ? boxAround(bounds) : null;
  return around ? sectionBoxFromBounds(around) : null;
}

function union(boxes: FitBox[]): FitBox | null {
  if (boxes.length === 0) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const b of boxes) {
    for (const k of ['x', 'y', 'z'] as const) { min[k] = Math.min(min[k], b.min[k]); max[k] = Math.max(max[k], b.max[k]); }
  }
  return { min, max };
}

/** Globálne id výberu viewera (viacnásobný výber má prednosť pred jednoduchým). */
function selectedIds(state: State): number[] {
  if (state.selectedEntityIds && state.selectedEntityIds.size > 0) return Array.from(state.selectedEntityIds);
  return state.selectedEntityId !== null ? [state.selectedEntityId] : [];
}

/**
 * Pridá rezný box okolo `ids` (alebo okolo výberu, a keď nič nie je vybrané,
 * okolo `fallback`, napr. obálky modelu). false = nebolo z čoho box spraviť
 * alebo je sada rezov plná.
 */
export function addBoxCut(ids?: readonly number[], fallback?: FitBox | null): boolean {
  const state = useViewerStore.getState();
  const target = ids && ids.length > 0 ? ids : selectedIds(state);
  const box = sectionBoxForEntities(target, fallback);
  if (!box) return false;
  leaveAlignmentMode();
  if (!state.prepareNewSectionPlane()) return false;
  useViewerStore.getState().setSectionBox(box);
  return true;
}
