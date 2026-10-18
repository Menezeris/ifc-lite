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
 * itself has no relationships). Nothing renders without AIM panel data.
 */

import { useMemo } from 'react';
import { useViewerStore } from '@/store';
import { toGlobalIdFromModels } from '@/store/globalId';
import { selectPickedGlobalId } from '@/components/viewer/viewport-selection';
import { resolveGuids, derivedRelationsOf, type DerivedRelationWire } from './bridge-protocol';
import { useAimPanelStore } from './aimPanelStore';
import { useAimDerivationsStore } from './aimDerivationsStore';
import { visibleDerivedRelations } from './derivations';

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
function selectByGuid(guid: string): boolean {
  const state = useViewerStore.getState();
  const [ref] = resolveGuids(state.models, [guid]);
  if (!ref) return false;
  selectPickedGlobalId(toGlobalIdFromModels(state.models, ref.modelId, ref.expressId));
  const frame = useViewerStore.getState().cameraCallbacks.frameSelection;
  if (frame) window.setTimeout(() => frame(), 50);
  return true;
}

function AimBadge() {
  return (
    <span className="font-mono text-2xs font-bold leading-none px-1 py-0.5 border border-primary/50 text-primary bg-primary/10 shrink-0">
      AIM
    </span>
  );
}

function DerivedRelationItem({ relation }: { relation: DerivedRelationWire }) {
  const models = useViewerStore((s) => s.models);
  const { other } = relation;
  const label = other.ref ?? other.name ?? other.objectId;
  const selectable = other.guid !== null && resolveGuids(models, [other.guid]).length > 0;
  const relationLabel = relation.ifcRelation ?? `cez priestor ${relation.viaSpaceRef ?? '?'}`;
  const arrow = relation.direction === 'outgoing' ? '→' : '←';
  const title = [
    `${relation.ifcRelation ?? 'IfcZone cez priestor'} (${relation.direction === 'outgoing' ? 'prvok je v cieli' : 'prvok je cieľ'})`,
    relation.role ? `rola: ${relation.role}` : null,
    `${label}${other.name && other.name !== label ? `, ${other.name}` : ''}${other.ifcType ? ` (${other.ifcType})` : ''}`,
    relation.viaSpaceRef ? `cez priestor ${relation.viaSpaceRef}` : null,
    `zdroj: ${relation.ruleName}`,
  ].filter(Boolean).join('\n');

  const body = (
    <>
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-zinc-500 text-2xs shrink-0">{arrow}</span>
        <AimBadge />
        <span className={selectable ? 'truncate' : 'truncate text-zinc-600 dark:text-zinc-400'}>
          {label}
          {other.name && other.name !== label && <span className="text-zinc-500"> {other.name}</span>}
        </span>
        {other.ifcType && <span className="text-2xs text-zinc-400 ml-auto shrink-0">{other.ifcType}</span>}
      </span>
      <span className="block pl-5 text-2xs text-zinc-500 truncate">
        {[relationLabel, relation.role, relation.ruleName].filter(Boolean).join(' | ')}
      </span>
    </>
  );

  if (!selectable || other.guid === null) {
    return <div className="text-xs py-0.5 w-full" title={title} data-aim-derived>{body}</div>;
  }
  const guid = other.guid;
  return (
    <button
      type="button"
      className="block text-xs py-0.5 w-full text-left text-zinc-700 dark:text-zinc-300 hover:text-primary transition-colors"
      title={title}
      onClick={() => selectByGuid(guid)}
      data-aim-derived
    >
      {body}
    </button>
  );
}

/** The AIM group inside Relationship records; null when there is nothing to show. */
export function AimDerivedRelations() {
  const { relations, more } = useAimDerivedRelations();
  if (relations.length === 0 && more <= 0) return null;
  return (
    <div className="px-3 py-2" data-aim-derived-relations>
      <div className="flex items-center gap-1.5 text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
        <AimBadge />
        <span>Odvodené záznamy ({relations.length + more})</span>
      </div>
      {relations.map((relation, i) => (
        <DerivedRelationItem
          key={`${relation.ruleId}:${relation.direction}:${relation.other.objectId}:${i}`}
          relation={relation}
        />
      ))}
      {more > 0 && <p className="text-2xs text-zinc-500 pt-0.5">a ďalších {more}</p>}
    </div>
  );
}
