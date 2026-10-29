/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Viacnásobný SELECT z hosta (AIM #217, #273): všetky prvky nad prvým sa pridajú do výberu jedným
 * zápisom do store. Predtým šiel každý prvok ako Ctrl+klik (`toggleGlobalIdInSelection`): štyri zápisy
 * a štyri kópie množín na prvok, takže výber 200 prvkov podľa `ifc_type` bol O(N^2) a každý zápis
 * budil všetkých odberateľov (renderer, panely, výplň miestností). `APPLIED` tak prišlo po 3 s limite
 * hosta alebo vôbec. Čisté jadro `planAddToSelection` je bez store, aby sa dalo testovať.
 */

import type { EntityRef } from '../store/types.js';
import { entityRefToString } from '../store/entity-ref.js';
import { useViewerStore, resolveEntityRef } from '../store/index.js';

export interface SelectionSnapshot {
  selectedEntitiesSet: ReadonlySet<string>;
  selectedEntityIds: ReadonlySet<number>;
  selectedEntityId: number | null;
  selectedEntity: EntityRef | null;
  selectionRevision: number;
}

export interface SelectionPatch {
  selectedEntitiesSet: Set<string>;
  selectedEntityIds: Set<number>;
  selectedEntityId: number;
  selectedEntity: EntityRef;
  selectionRevision: number;
}

/**
 * Pridá `globalIds` k výberu naraz so stavom, aký by nechal rad Ctrl+klikov: oba kanály výberu
 * (id pre renderer, `EntityRef` pre panel vlastností) obsahujú všetky prvky, primárny je posledný.
 * Prvý Ctrl+klik ponechá jednoduchý výber (primárny prvok z `selectPickedGlobalId`), preto sa aj teraz
 * pripočíta, ak sú množiny ešte prázdne. Prvok, ktorý už vo výbere je, ostane (Ctrl+klik by ho vypol,
 * host chce zjednotenie). null = nič nepridať.
 */
export function planAddToSelection(
  state: SelectionSnapshot,
  globalIds: readonly number[],
  resolve: (globalId: number) => EntityRef,
): SelectionPatch | null {
  const refs = globalIds.map(resolve);
  const last = refs[refs.length - 1];
  if (!last) return null;
  const entities = new Set(state.selectedEntitiesSet);
  const ids = new Set(state.selectedEntityIds);
  if (entities.size === 0 && state.selectedEntity) {
    entities.add(entityRefToString(state.selectedEntity));
    if (state.selectedEntityId !== null) ids.add(state.selectedEntityId);
  }
  for (const id of globalIds) ids.add(id);
  for (const ref of refs) entities.add(entityRefToString(ref));
  return {
    selectedEntitiesSet: entities,
    selectedEntityIds: ids,
    selectedEntityId: globalIds[globalIds.length - 1],
    selectedEntity: last,
    selectionRevision: state.selectionRevision + 1,
  };
}

/** Jeden zápis do store pre celé pridanie (jedno prekreslenie, nie N). */
export function addGlobalIdsToSelection(globalIds: readonly number[]): void {
  useViewerStore.setState((s) => planAddToSelection(s, globalIds, resolveEntityRef) ?? {});
}
