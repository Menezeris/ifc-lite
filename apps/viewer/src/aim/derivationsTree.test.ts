/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { DerivedRelationWire } from './derivations-protocol.js';
import { derivedRelationsOf } from './derivations-protocol.js';
import { derivedRelationLabel, groupDerivedRelations } from './derivationsTree.js';

const rel = (
  ref: string,
  ifcType: string,
  extra: Partial<DerivedRelationWire> & { predefinedType?: string | null } = {},
): DerivedRelationWire => {
  const { predefinedType, ...rest } = extra;
  return {
    ruleId: 'r-space',
    ruleName: 'Prvok v priestore',
    ifcRelation: 'IfcRelReferencedInSpatialStructure',
    direction: 'outgoing',
    role: 'inside',
    other: { objectId: `id-${ref}`, guid: null, ref, name: null, ifcType, ...(predefinedType !== undefined ? { predefinedType } : {}) },
    ...rest,
  };
};

describe('groupDerivedRelations (AIM D-106)', () => {
  it('relation > class / PredefinedType > instances, with counts and natural order', () => {
    const groups = groupDerivedRelations([
      rel('3.10', 'IfcSpace', { predefinedType: 'SPACE' }),
      rel('PZ14', 'IfcSpatialZone', { predefinedType: 'FIRESAFETY', ruleId: 'r-sz', ruleName: 'Prvok v priestorovej zóne' }),
      rel('3.02', 'IfcSpace', { predefinedType: 'SPACE' }),
      rel('N3.01', 'IfcSpatialZone', { predefinedType: 'THERMAL', ruleId: 'r-sz', ruleName: 'Prvok v priestorovej zóne' }),
      rel('NJ - 3NP', 'IfcZone', { ifcRelation: null, ruleId: 'r-zone', ruleName: 'Prvok v zóne', viaSpaceRef: '3.02' }),
    ]);
    assert.deepEqual(groups.map((g) => [g.label, g.count, g.rules]), [
      ['IfcRelReferencedInSpatialStructure', 4, ['Prvok v priestore', 'Prvok v priestorovej zóne']],
      ['IfcZone cez priestor', 1, ['Prvok v zóne']],
    ]);
    assert.deepEqual(groups[0].classes.map((c) => [c.label, c.relations.map(derivedRelationLabel)]), [
      ['IfcSpace / SPACE', ['3.02', '3.10']],
      ['IfcSpatialZone / FIRESAFETY', ['PZ14']],
      ['IfcSpatialZone / THERMAL', ['N3.01']],
    ]);
  });

  it('direction splits the same relation; a class without PredefinedType or class keeps a readable label', () => {
    const groups = groupDerivedRelations([
      rel('VV.01', 'IfcAirTerminal', { direction: 'incoming' }),
      rel('3.02', 'IfcSpace'),
      rel('X', null as unknown as string),
    ]);
    assert.deepEqual(groups.map((g) => [g.direction, g.count]), [['incoming', 1], ['outgoing', 2]]);
    assert.deepEqual(groups[1].classes.map((c) => c.label), ['bez IFC triedy', 'IfcSpace']);
  });
});

describe('derivedRelationsOf predefinedType (AIM D-106)', () => {
  it('keeps a string or null predefinedType and drops a malformed one', () => {
    const ok = rel('3.02', 'IfcSpace', { predefinedType: 'SPACE' });
    const none = rel('3.03', 'IfcSpace', { predefinedType: null });
    const bad = { ...rel('3.04', 'IfcSpace'), other: { ...rel('3.04', 'IfcSpace').other, predefinedType: 7 } };
    const { relations } = derivedRelationsOf({ derivedRelations: [ok, none, bad] });
    assert.deepEqual(relations.map((r) => r.other.ref), ['3.02', '3.03']);
  });
});
