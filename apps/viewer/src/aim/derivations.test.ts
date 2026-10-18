/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { DerivedRelationWire } from './derivations-protocol.js';
import { modelKey, revisionForModel, safeManageUrl, visibleDerivedRelations } from './derivations.js';
import { formatRelativeTime } from './derivationsFormat.js';

describe('modelKey / revisionForModel', () => {
  const revisions = [{ model: 'ASR', revision: 72 }, { model: 'VZT', revision: 15 }];

  it('pairs a loaded model by file name without extension, like the host key', () => {
    assert.equal(modelKey('ASR.ifc'), 'ASR');
    assert.equal(modelKey('models/ifc/VZT.ifc'), 'VZT');
    assert.equal(modelKey('ASR'), 'ASR');
    assert.equal(revisionForModel(revisions, 'ASR.ifc'), 72);
    assert.equal(revisionForModel(revisions, 'vzt.IFC'), 15);
  });

  it('shows nothing on any mismatch, never a substring guess', () => {
    assert.equal(revisionForModel(revisions, 'ASR_old.ifc'), null);
    assert.equal(revisionForModel(revisions, 'AS.ifc'), null);
    assert.equal(revisionForModel(revisions, ''), null);
    assert.equal(revisionForModel([], 'ASR.ifc'), null);
  });
});

describe('visibleDerivedRelations', () => {
  const rel = (ruleId: string): DerivedRelationWire => ({
    ruleId,
    ruleName: ruleId,
    ifcRelation: null,
    direction: 'outgoing',
    role: null,
    other: { objectId: ruleId, guid: null, ref: null, name: null, ifcType: null },
  });
  const all = [rel('a'), rel('b'), rel('a')];

  it('shows everything by default', () => {
    assert.deepEqual(visibleDerivedRelations(all, { relationsVisible: true, hiddenRuleIds: [] }), all);
  });

  it('hides everything with the global eye off', () => {
    assert.deepEqual(visibleDerivedRelations(all, { relationsVisible: false, hiddenRuleIds: [] }), []);
  });

  it('hides the rules switched off per rule', () => {
    assert.deepEqual(visibleDerivedRelations(all, { relationsVisible: true, hiddenRuleIds: ['a'] }), [rel('b')]);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');

  it('formats minutes, hours and days', () => {
    assert.equal(formatRelativeTime('2026-10-18T11:59:40Z', now), 'práve teraz');
    assert.equal(formatRelativeTime('2026-10-18T11:55:00Z', now), 'pred 5 min');
    assert.equal(formatRelativeTime('2026-10-18T09:00:00Z', now), 'pred 3 h');
    assert.equal(formatRelativeTime('2026-10-16T12:00:00Z', now), 'pred 2 d');
  });

  it('shows an unparsable timestamp as sent', () => {
    assert.equal(formatRelativeTime('yesterday', now), 'yesterday');
  });
});

describe('safeManageUrl', () => {
  it('passes absolute http(s) links only', () => {
    assert.equal(safeManageUrl('https://github.com/o/r/actions/workflows/odvodenie.yml'), 'https://github.com/o/r/actions/workflows/odvodenie.yml');
    assert.equal(safeManageUrl(undefined), null);
    assert.equal(safeManageUrl(''), null);
    assert.equal(safeManageUrl('javascript:alert(1)'), null);
    assert.equal(safeManageUrl('/relative/path'), null);
  });
});
