/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Body of the AIM records group in Relationship records (lazy, see
 * AimDerivedRelations.tsx). An AIM badge stands where the file rows show the
 * entity number: these relations live in the AIM database, not in the IFC
 * file. Everything comes in as props, so this chunk imports no entry module.
 */

import type { DerivedRelationWire } from './derivations-protocol';

function AimBadge() {
  return (
    <span className="font-mono text-2xs font-bold leading-none px-1 py-0.5 border border-primary/50 text-primary bg-primary/10 shrink-0">
      AIM
    </span>
  );
}

function DerivedRelationItem({ relation, selectable, onSelectGuid }: {
  relation: DerivedRelationWire;
  selectable: boolean;
  onSelectGuid: (guid: string) => void;
}) {
  const { other } = relation;
  const label = other.ref ?? other.name ?? other.objectId;
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
      onClick={() => onSelectGuid(guid)}
      data-aim-derived
    >
      {body}
    </button>
  );
}

export interface AimDerivedRelationsBodyProps {
  relations: readonly DerivedRelationWire[];
  /** Rows the host cut off by its cap ("a ďalších N"). */
  more: number;
  /** GUIDs of other ends present in the loaded models (clickable rows). */
  selectableGuids: ReadonlySet<string>;
  onSelectGuid: (guid: string) => void;
}

/** The AIM group inside Relationship records. */
export function AimDerivedRelationsBody({ relations, more, selectableGuids, onSelectGuid }: AimDerivedRelationsBodyProps) {
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
          selectable={relation.other.guid !== null && selectableGuids.has(relation.other.guid)}
          onSelectGuid={onSelectGuid}
        />
      ))}
      {more > 0 && <p className="text-2xs text-zinc-500 pt-0.5">a ďalších {more}</p>}
    </div>
  );
}
