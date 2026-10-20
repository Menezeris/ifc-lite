/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tree of the AIM derived relations in Relationship records (AIM D-106):
 * relation (and direction) > IFC class / PredefinedType > instances, with
 * counts. Pure, so it unit-tests without React; only the lazily loaded
 * AimDerivedRelationsBody imports it, never the entry chunk.
 */

import type { DerivedRelationWire } from './derivations-protocol.js';

/** A class group with more rows than this starts collapsed; smaller ones start open. */
export const OPEN_CLASS_LIMIT = 20;

export interface DerivedClassGroup {
  key: string;
  /** `IfcSpatialZone / THERMAL`, or just the class without a PredefinedType. */
  label: string;
  relations: DerivedRelationWire[];
}

export interface DerivedRelationGroup {
  key: string;
  direction: DerivedRelationWire['direction'];
  /** IFC relationship the derivation stands for; the zone rule has none (via spaces). */
  label: string;
  /** Rule names behind the group, for the tooltip. */
  rules: string[];
  count: number;
  classes: DerivedClassGroup[];
}

const NO_IFC_RELATION = 'IfcZone cez priestor';
const collator = new Intl.Collator('sk', { numeric: true, sensitivity: 'base' });

/** Text a row is sorted and shown by: object ref, else name, else id. */
export function derivedRelationLabel(relation: DerivedRelationWire): string {
  const { other } = relation;
  return other.ref ?? other.name ?? other.objectId;
}

function classLabel(other: DerivedRelationWire['other']): string {
  const ifcType = other.ifcType ?? 'bez IFC triedy';
  return other.predefinedType ? `${ifcType} / ${other.predefinedType}` : ifcType;
}

/**
 * Groups relations by relation + direction (in the host's order), then by
 * class label (sorted), rows sorted by label with numbers in natural order.
 */
export function groupDerivedRelations(relations: readonly DerivedRelationWire[]): DerivedRelationGroup[] {
  const groups = new Map<string, { group: DerivedRelationGroup; classes: Map<string, DerivedClassGroup> }>();
  for (const relation of relations) {
    const label = relation.ifcRelation ?? NO_IFC_RELATION;
    const key = `${relation.direction}:${label}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { group: { key, direction: relation.direction, label, rules: [], count: 0, classes: [] }, classes: new Map() };
      groups.set(key, entry);
    }
    const { group, classes } = entry;
    group.count += 1;
    if (!group.rules.includes(relation.ruleName)) group.rules.push(relation.ruleName);
    const cls = classLabel(relation.other);
    let classGroup = classes.get(cls);
    if (!classGroup) {
      classGroup = { key: `${key}:${cls}`, label: cls, relations: [] };
      classes.set(cls, classGroup);
    }
    classGroup.relations.push(relation);
  }
  return [...groups.values()].map(({ group, classes }) => ({
    ...group,
    classes: [...classes.values()]
      .sort((a, b) => collator.compare(a.label, b.label))
      .map((c) => ({ ...c, relations: [...c.relations].sort((a, b) => collator.compare(derivedRelationLabel(a), derivedRelationLabel(b))) })),
  }));
}
