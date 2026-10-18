/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { SOURCE, type AimPanelData } from './bridge-protocol.js';
import { derivedRelationsOf, isDerivationsMessage } from './derivations-protocol.js';

describe('AIM_DERIVATIONS_LOAD (D-089)', () => {
  const rule = {
    id: 'r1',
    name: 'element_in_space',
    kind: 'geometry',
    enabled: true,
    mode: 'auto',
    targetClasses: ['IfcSpace'],
    roles: ['inside', 'partial'],
    count: 42,
    lastRun: { at: '2026-10-18T10:00:00Z', status: 'ok', written: 3, closed: 1 },
  };
  const layer = { version: 1, rules: [rule], models: [{ model: 'ASR', revision: 72 }], manageUrl: 'https://github.com/x/y/actions' };
  const msg = (l: unknown) => ({ source: SOURCE, type: 'AIM_DERIVATIONS_LOAD', layer: l });

  it('accepts a well-formed layer, with or without manageUrl and lastRun', () => {
    assert.ok(isDerivationsMessage(msg(layer)));
    assert.ok(isDerivationsMessage(msg({ version: 1, rules: [{ ...rule, lastRun: null, kind: 'via_space', mode: 'manual' }], models: [] })));
    assert.ok(isDerivationsMessage(msg({ version: 1, rules: [], models: [] })));
  });

  it('ignores an unknown layer version so a newer host cannot feed an unknown shape', () => {
    assert.equal(isDerivationsMessage(msg({ ...layer, version: 2 })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, version: undefined })), false);
  });

  it('rejects a foreign envelope or another message type', () => {
    assert.equal(isDerivationsMessage({ ...msg(layer), source: 'react-devtools-bridge' }), false);
    assert.equal(isDerivationsMessage({ ...msg(layer), type: 'AIM_TREE_DECORATIONS' }), false);
    assert.equal(isDerivationsMessage({ type: 'AIM_DERIVATIONS_LOAD', layer }), false);
    assert.equal(isDerivationsMessage(null), false);
  });

  it('rejects a missing or malformed layer', () => {
    assert.equal(isDerivationsMessage({ source: SOURCE, type: 'AIM_DERIVATIONS_LOAD' }), false);
    assert.equal(isDerivationsMessage(msg(null)), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: 'x' })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, models: [{ model: 'ASR', revision: '72' }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, models: [{ model: '', revision: 72 }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, manageUrl: 5 })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: [{ ...rule, kind: 'other' }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: [{ ...rule, mode: 'sometimes' }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: [{ ...rule, enabled: 'yes' }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: [{ ...rule, id: '' }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: [{ ...rule, count: -1 }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: [{ ...rule, targetClasses: [1] }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: [{ ...rule, lastRun: { at: 'x', status: 'ok', written: 'a', closed: 0 } }] })), false);
    assert.equal(isDerivationsMessage(msg({ ...layer, rules: [{ ...rule, lastRun: undefined }] })), false);
  });
});

describe('derivedRelationsOf (D-089)', () => {
  const base: AimPanelData = { version: 2, guid: 'g', title: 't' };
  const relation = {
    ruleId: 'r1',
    ruleName: 'element_in_space',
    ifcRelation: 'IfcRelReferencedInSpatialStructure' as const,
    direction: 'outgoing' as const,
    role: 'inside',
    other: { objectId: 'o1', guid: 'G1', ref: 'DD01.06.03', name: 'Kancelária', ifcType: 'IfcSpace' },
  };

  it('treats a missing field as no relations (v1/v2 payloads unchanged)', () => {
    assert.deepEqual(derivedRelationsOf(base), { relations: [], total: 0 });
  });

  it('keeps well-formed rows and the host total, which never drops below the rows', () => {
    const zone = { ...relation, ruleId: 'r3', ifcRelation: null, direction: 'incoming' as const, role: null, viaSpaceRef: 'DD01.06.03' };
    assert.deepEqual(derivedRelationsOf({ ...base, derivedRelations: [relation, zone], derivedTotal: 250 }), {
      relations: [relation, zone],
      total: 250,
    });
    assert.equal(derivedRelationsOf({ ...base, derivedRelations: [relation], derivedTotal: 0 }).total, 1);
    assert.equal(derivedRelationsOf({ ...base, derivedRelations: [relation], derivedTotal: Number.NaN }).total, 1);
  });

  it('drops malformed rows instead of failing the whole group', () => {
    const bad = [
      { ...relation, direction: 'sideways' },
      { ...relation, ifcRelation: 'IfcRelContainedInSpatialStructure' },
      { ...relation, other: null },
      { ...relation, other: { ...relation.other, guid: 7 } },
      { ...relation, role: 3 },
      { ...relation, viaSpaceRef: 3 },
      'junk',
    ];
    const data = { ...base, derivedRelations: [relation, ...bad] } as unknown as AimPanelData;
    assert.deepEqual(derivedRelationsOf(data).relations, [relation]);
    assert.deepEqual(derivedRelationsOf({ ...base, derivedRelations: 'x' } as unknown as AimPanelData).relations, []);
  });
});
