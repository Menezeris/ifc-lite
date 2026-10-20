/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isInboundMessage } from './bridge-protocol.js';
import { focusFor, panelPlan, parsePanelView, selectPanel } from './aimPanelViewPlan.js';

const S = 'aim-bridge' as const;
const GUID = '0MJFXziqDE$gGyPWwro9fJ';

describe('panel vlastností z chatu (AIM D-113)', () => {
  it('SELECT s panelom prejde obálkou mosta, bez panela ostáva ako doteraz', () => {
    assert.equal(isInboundMessage({ source: S, type: 'SELECT', guid: GUID }), true);
    assert.equal(isInboundMessage({ source: S, type: 'SELECT', guid: GUID, panel: { tab: 'ifc', section: 'quantities' } }), true);
    assert.equal(
      isInboundMessage({ source: S, type: 'SELECT', guid: GUID, panel: { focus: { pset: 'Pset_WallCommon', property: 'FireRating' } } }),
      true,
    );
  });

  it('neplatný panel zahodí celú správu (null), chýbajúci panel nie (undefined)', () => {
    assert.strictEqual(selectPanel(undefined), undefined);
    assert.strictEqual(selectPanel(null), undefined);
    assert.deepEqual(selectPanel({ tab: 'ifc' }), { tab: 'ifc' });
    assert.strictEqual(selectPanel({ tab: 'raw' }), null);
    assert.strictEqual(selectPanel({ section: 'bsdd' }), null);
    assert.strictEqual(selectPanel({ focus: { pset: 'Pset_WallCommon' } }), null);
    assert.strictEqual(selectPanel('ifc'), null);
    assert.strictEqual(parsePanelView({ focus: { pset: '', property: 'x' } }), null);
    assert.strictEqual(parsePanelView({ focus: { pset: 'P', property: 'x'.repeat(201) } }), null);
  });

  it('plán: focus vždy pod IFC v sekcii Properties, sekcia bez záložky ide pod IFC', () => {
    assert.deepEqual(panelPlan({ tab: 'aim', section: 'quantities', focus: { pset: 'P', property: 'X' } }), {
      tab: 'ifc',
      section: 'properties',
      focus: { pset: 'P', property: 'X' },
    });
    assert.deepEqual(panelPlan({ section: 'quantities' }), { tab: 'ifc', section: 'quantities' });
    assert.deepEqual(panelPlan({ tab: 'aim' }), { tab: 'aim' });
    assert.deepEqual(panelPlan({}), {});
  });

  it('focus len pre prvok zo SELECT, nie pre medzičasom iný výber', () => {
    const target = { modelId: 'm1', expressId: 7 };
    const focus = { pset: 'Pset_WallCommon', property: 'FireRating' };
    assert.deepEqual(focusFor({ modelId: 'm1', expressId: 7 }, target, focus), {
      modelId: 'm1', entityId: 7, psetName: 'Pset_WallCommon', propName: 'FireRating',
    });
    assert.strictEqual(focusFor({ modelId: 'm1', expressId: 8 }, target, focus), null);
    assert.strictEqual(focusFor({ modelId: 'm2', expressId: 7 }, target, focus), null);
    assert.strictEqual(focusFor(null, target, focus), null);
  });
});
