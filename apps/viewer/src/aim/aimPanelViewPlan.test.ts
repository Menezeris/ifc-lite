/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isInboundMessage } from './bridge-protocol.js';
import { focusSections, isQuantitySetName, matchName, panelPlan, parsePanelView, propKeyEntity, selectPanel } from './aimPanelViewPlan.js';

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

  it('plán (AIM D-127): sekcia podľa sady vlastnosti, záložka sa už nenastavuje', () => {
    assert.deepEqual(panelPlan({ tab: 'aim', section: 'quantities', focus: { pset: 'P', property: 'X' } }), {
      section: 'properties',
      focus: { pset: 'P', property: 'X' },
    });
    assert.deepEqual(panelPlan({ focus: { pset: 'Qto_DoorBaseQuantities', property: 'Width' } }), {
      section: 'quantities',
      focus: { pset: 'Qto_DoorBaseQuantities', property: 'Width' },
    });
    assert.deepEqual(panelPlan({ section: 'quantities' }), { section: 'quantities' });
    assert.deepEqual(panelPlan({ tab: 'aim' }), {});
    assert.deepEqual(panelPlan({}), {});
  });

  it('výmery: Qto_ a BaseQuantities sa hľadajú najprv v Quantities, ostatné v Properties', () => {
    assert.equal(isQuantitySetName('Qto_WallBaseQuantities'), true);
    assert.equal(isQuantitySetName('qto_x'), true);
    assert.equal(isQuantitySetName('BaseQuantities'), true);
    assert.equal(isQuantitySetName('AIM_FireSafety'), false);
    assert.deepEqual(focusSections('Qto_SpaceBaseQuantities'), ['quantities', 'properties']);
    assert.deepEqual(focusSections('AIM_FireSafety'), ['properties', 'quantities']);
  });

  it('kľúč riadka panela: výskyt aj typ, presne aj bez ohľadu na veľkosť písmen', () => {
    assert.equal(propKeyEntity('412:AIM_FireSafety:FireCompartments', 'AIM_FireSafety', 'FireCompartments'), 412);
    assert.equal(propKeyEntity('90:Pset_DoorCommon:FireRating', 'pset_doorcommon', 'firerating'), 90);
    assert.equal(propKeyEntity('412:AIM_FireSafety:FireCompartment', 'AIM_FireSafety', 'FireCompartments'), null);
    assert.equal(propKeyEntity('412:Other:FireCompartments', 'AIM_FireSafety', 'FireCompartments'), null);
    assert.equal(propKeyEntity(':AIM_FireSafety:FireCompartments', 'AIM_FireSafety', 'FireCompartments'), null);
    assert.equal(propKeyEntity('x:AIM_FireSafety:FireCompartments', 'AIM_FireSafety', 'FireCompartments'), null);
  });

  it('meno sady alebo riadka: presná zhoda má prednosť pred voľnou', () => {
    assert.equal(matchName(['width', 'Width'], 'Width'), 1);
    assert.equal(matchName(['Height', ' width '], 'Width'), 1);
    assert.equal(matchName([null, undefined, 'Area'], 'Width'), -1);
  });
});
