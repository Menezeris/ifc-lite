/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM records in Relationship records (D-089 phase B) - the derived relations
 * of the selected element from `AimPanelData.derivedRelations`, shown as one
 * group next to the file's own IfcRel records. An AIM badge stands where the
 * file rows show the entity number: these relations live in the AIM database,
 * not in the IFC file. The eye toggles (global in the AIM ribbon tab, per rule
 * in AIM LAYERS) filter the list locally.
 *
 * Mounted by AIM-FORK lines in RelationshipsCard (`useAimDerivedRelationCount`
 * folds the rows into the card count so the card also shows when the file
 * itself has no relationships). Nothing renders without AIM panel data; the
 * rows themselves load lazily (AimDerivedRelationsBody.tsx).
 */

import { lazy, Suspense, useMemo } from 'react';
import { useViewerStore } from '@/store';
import { toGlobalIdFromModels } from '@/store/globalId';
import { selectPickedGlobalId } from '@/components/viewer/viewport-selection';
import { resolveGuids } from './bridge-protocol';
import { derivedRelationsOf, type DerivedRelationWire } from './derivations-protocol';
import { useAimPanelStore } from './aimPanelStore';
import { useAimDerivationsStore } from './aimDerivationsStore';
import { visibleDerivedRelations } from './derivations';

const AimDerivedRelationsBody = lazy(() =>
  import('./AimDerivedRelationsBody').then((m) => ({ default: m.AimDerivedRelationsBody })),
);

const EMPTY = { relations: [] as DerivedRelationWire[], total: 0 };

/** Visible derived relations of the selected element + the host's total. */
function useAimDerivedRelations() {
  const panel = useAimPanelStore((s) => s.panel);
  const relationsVisible = useAimDerivationsStore((s) => s.relationsVisible);
  const hiddenRuleIds = useAimDerivationsStore((s) => s.hiddenRuleIds);
  return useMemo(() => {
    const all = panel.status === 'ready' ? derivedRelationsOf(panel.data) : EMPTY;
    const relations = visibleDerivedRelations(all.relations, { relationsVisible, hiddenRuleIds });
    // Rows the host cut off by its cap; unknown per rule, so only while nothing is filtered.
    const more = relationsVisible && hiddenRuleIds.length === 0 ? all.total - all.relations.length : 0;
    return { relations, more };
  }, [panel, relationsVisible, hiddenRuleIds]);
}

/** Row count the AIM group adds to the Relationship records card. */
export function useAimDerivedRelationCount(): number {
  const { relations, more } = useAimDerivedRelations();
  return relations.length + more;
}

/** Select the other end like a viewport click (the same path AimBridge SELECT takes). */
function selectByGuid(guid: string): void {
  const state = useViewerStore.getState();
  const [ref] = resolveGuids(state.models, [guid]);
  if (!ref) return;
  selectPickedGlobalId(toGlobalIdFromModels(state.models, ref.modelId, ref.expressId));
  const frame = useViewerStore.getState().cameraCallbacks.frameSelection;
  if (frame) window.setTimeout(() => frame(), 50);
}

/** The AIM group inside Relationship records; null when there is nothing to show. */
export function AimDerivedRelations() {
  const { relations, more } = useAimDerivedRelations();
  const models = useViewerStore((s) => s.models);
  const selectableGuids = useMemo(() => {
    const guids = new Set<string>();
    for (const r of relations) {
      if (r.other.guid !== null && resolveGuids(models, [r.other.guid]).length > 0) guids.add(r.other.guid);
    }
    return guids;
  }, [relations, models]);
  if (relations.length === 0 && more <= 0) return null;
  return (
    <Suspense fallback={null}>
      <AimDerivedRelationsBody relations={relations} more={more} selectableGuids={selectableGuids} onSelectGuid={selectByGuid} />
    </Suspense>
  );
}
