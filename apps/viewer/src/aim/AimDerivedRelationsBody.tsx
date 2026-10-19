/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Body of the AIM records group in Relationship records (lazy, see
 * AimDerivedRelations.tsx). These relations live in the AIM database, not in
 * the IFC file: one AIM badge on the heading and a tinted frame around the
 * whole group say so (D-106), instead of a badge on every row. Rows form a
 * tree (derivationsTree.ts): relation > IFC class / PredefinedType > instances;
 * the first two levels start open, a large class group starts collapsed.
 * Everything comes in as props, so this chunk imports no entry module.
 */

import type { DerivedRelationWire } from './derivations-protocol';
import { OPEN_CLASS_LIMIT, derivedRelationLabel, groupDerivedRelations } from './derivationsTree';

function AimBadge() {
  return (
    <span className="font-mono text-2xs font-bold leading-none px-1 py-0.5 border border-primary/50 text-primary bg-primary/10 shrink-0">
      AIM
    </span>
  );
}

function Count({ n }: { n: number }) {
  return <span className="ml-auto pl-2 text-2xs tabular-nums text-zinc-500 shrink-0">{n}</span>;
}

const SUMMARY_CLASS = 'flex items-center gap-1.5 cursor-pointer select-none list-none py-0.5 hover:text-primary [&::-webkit-details-marker]:hidden';
const CHEVRON_CLASS = 'text-2xs text-zinc-400 transition-transform shrink-0';

function DerivedRelationItem({ relation, selectable, onSelectGuid }: {
  relation: DerivedRelationWire;
  selectable: boolean;
  onSelectGuid: (guid: string) => void;
}) {
  const { other } = relation;
  const label = derivedRelationLabel(relation);
  const title = [
    `${relation.ifcRelation ?? 'IfcZone cez priestor'} (${relation.direction === 'outgoing' ? 'prvok je v cieli' : 'prvok je cieľ'})`,
    relation.role ? `rola: ${relation.role}` : null,
    `${label}${other.name && other.name !== label ? `, ${other.name}` : ''}${other.ifcType ? ` (${other.ifcType}${other.predefinedType ? ` / ${other.predefinedType}` : ''})` : ''}`,
    relation.viaSpaceRef ? `cez priestor ${relation.viaSpaceRef}` : null,
    `zdroj: ${relation.ruleName}`,
  ].filter(Boolean).join('\n');

  const body = (
    <span className="flex items-center gap-2 min-w-0">
      <span className={selectable ? 'truncate' : 'truncate text-zinc-600 dark:text-zinc-400'}>
        {label}
        {other.name && other.name !== label && <span className="text-zinc-500"> {other.name}</span>}
        {relation.viaSpaceRef && <span className="text-zinc-500"> cez {relation.viaSpaceRef}</span>}
      </span>
      {relation.role && <span className="text-2xs text-zinc-400 ml-auto shrink-0">{relation.role}</span>}
    </span>
  );

  if (!selectable || other.guid === null) {
    return <div className="text-xs py-0.5 pl-4 w-full" title={title} data-aim-derived>{body}</div>;
  }
  const guid = other.guid;
  return (
    <button
      type="button"
      className="block text-xs py-0.5 pl-4 w-full text-left text-zinc-700 dark:text-zinc-300 hover:text-primary transition-colors"
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
  const groups = groupDerivedRelations(relations);
  return (
    <div className="mx-3 my-2 px-2 py-1.5 border border-primary/30 bg-primary/5" data-aim-derived-relations>
      <div className="flex items-center gap-1.5 text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
        <AimBadge />
        <span>Odvodené záznamy ({relations.length + more})</span>
      </div>
      {groups.map((group) => (
        <details key={group.key} open className="group/rel text-xs" data-aim-derived-group>
          <summary className={`${SUMMARY_CLASS} font-medium text-zinc-700 dark:text-zinc-300`} title={`zdroj: ${group.rules.join(', ')}`}>
            <span className={`${CHEVRON_CLASS} group-open/rel:rotate-90`}>▶</span>
            <span className="font-mono text-2xs text-zinc-500 shrink-0">{group.direction === 'outgoing' ? '→' : '←'}</span>
            <span className="truncate">{group.label}</span>
            <Count n={group.count} />
          </summary>
          <div className="pl-3">
            {group.classes.map((cls) => (
              <details key={cls.key} open={cls.relations.length <= OPEN_CLASS_LIMIT} className="group/cls" data-aim-derived-class>
                <summary className={`${SUMMARY_CLASS} text-zinc-600 dark:text-zinc-400`}>
                  <span className={`${CHEVRON_CLASS} group-open/cls:rotate-90`}>▶</span>
                  <span className="truncate">{cls.label}</span>
                  <Count n={cls.relations.length} />
                </summary>
                {cls.relations.map((relation, i) => (
                  <DerivedRelationItem
                    key={`${relation.ruleId}:${relation.direction}:${relation.other.objectId}:${i}`}
                    relation={relation}
                    selectable={relation.other.guid !== null && selectableGuids.has(relation.other.guid)}
                    onSelectGuid={onSelectGuid}
                  />
                ))}
              </details>
            ))}
          </div>
        </details>
      ))}
      {more > 0 && <p className="text-2xs text-zinc-500 pt-0.5">a ďalších {more}</p>}
    </div>
  );
}
