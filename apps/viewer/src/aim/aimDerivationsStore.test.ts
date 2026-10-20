/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';

import type { DerivationRuleWire, DerivationsLayerWire } from './derivations-protocol.js';
import { useAimDerivationsStore } from './aimDerivationsStore.js';

const rule = (id: string): DerivationRuleWire => ({
  id,
  name: id,
  kind: 'geometry',
  enabled: true,
  mode: 'auto',
  targetClasses: ['IfcSpace'],
  roles: ['inside'],
  count: 1,
  lastRun: null,
});
const layer = (...ids: string[]): DerivationsLayerWire => ({ version: 1, rules: ids.map(rule), models: [] });
const initial = useAimDerivationsStore.getState();

describe('aimDerivationsStore', () => {
  beforeEach(() => useAimDerivationsStore.setState(initial, true));

  it('starts without a layer and with relations shown', () => {
    const s = useAimDerivationsStore.getState();
    assert.equal(s.layer, null);
    assert.equal(s.relationsVisible, true);
    assert.deepEqual(s.hiddenRuleIds, []);
  });

  it('stores the pushed layer and replaces it on a re-push', () => {
    useAimDerivationsStore.getState().setLayer(layer('a'));
    assert.deepEqual(useAimDerivationsStore.getState().layer?.rules.map((r) => r.id), ['a']);
    useAimDerivationsStore.getState().setLayer(layer('a', 'b'));
    assert.deepEqual(useAimDerivationsStore.getState().layer?.rules.map((r) => r.id), ['a', 'b']);
  });

  it('toggles the global and per-rule eyes locally', () => {
    const s = useAimDerivationsStore.getState();
    s.toggleRelationsVisible();
    assert.equal(useAimDerivationsStore.getState().relationsVisible, false);
    s.toggleRuleVisible('a');
    s.toggleRuleVisible('b');
    assert.deepEqual(useAimDerivationsStore.getState().hiddenRuleIds, ['a', 'b']);
    s.toggleRuleVisible('a');
    assert.deepEqual(useAimDerivationsStore.getState().hiddenRuleIds, ['b']);
  });

  it('keeps per-rule toggles across a re-push but drops rules the host no longer sends', () => {
    const s = useAimDerivationsStore.getState();
    s.setLayer(layer('a', 'b'));
    s.toggleRuleVisible('a');
    s.toggleRuleVisible('b');
    s.setLayer(layer('b', 'c'));
    assert.deepEqual(useAimDerivationsStore.getState().hiddenRuleIds, ['b']);
  });

  it('resets everything on teardown', () => {
    const s = useAimDerivationsStore.getState();
    s.setLayer(layer('a'));
    s.toggleRuleVisible('a');
    s.toggleRelationsVisible();
    s.clear();
    // A remounted bridge with a fresh layer must not inherit the old toggles.
    const after = useAimDerivationsStore.getState();
    assert.equal(after.layer, null);
    assert.deepEqual(after.hiddenRuleIds, []);
    assert.equal(after.relationsVisible, true);
  });
});
