/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { useAimUnderlays3d, underlaysHiddenIn3d, skipUnderlayRaster } from './aimUnderlays3d.js';
import { underlayIn3d } from './underlaysPlan.js';
import { isViewMessage } from './view-protocol.js';
import { SOURCE } from './bridge-protocol.js';

describe('podklady PDF v 3D (AIM D-133 doplnok, #170)', () => {
  beforeEach(() => useAimUnderlays3d.setState({ hidden: true }));

  it('predvolene sú podklady v 3D vypnuté (pri štarte sa nesťahujú)', () => {
    useAimUnderlays3d.setState(useAimUnderlays3d.getInitialState(), true);
    assert.equal(useAimUnderlays3d.getState().hidden, true);
  });

  it('skipUnderlayRaster: skrytý podklad bez textúry sa nerasterizuje, so textúrou alebo viditeľný áno', () => {
    assert.equal(skipUnderlayRaster({ visible: false }, false), true);
    assert.equal(skipUnderlayRaster({ visible: false }, true), false);
    assert.equal(skipUnderlayRaster({ visible: true }, false), false);
  });

  it('setShown(false) ich skryje, setShown(true) vráti', () => {
    useAimUnderlays3d.getState().setShown(true);
    assert.equal(useAimUnderlays3d.getState().hidden, false);
    useAimUnderlays3d.getState().setShown(false);
    assert.equal(useAimUnderlays3d.getState().hidden, true);
  });

  it('skrytie platí v 3D, v zamknutom pôdoryse (2D) nie', () => {
    assert.equal(underlaysHiddenIn3d({ hidden: true, viewLocked: false }), true);
    assert.equal(underlaysHiddenIn3d({ hidden: true, viewLocked: true }), false);
    assert.equal(underlaysHiddenIn3d({ hidden: false, viewLocked: false }), false);
  });

  it('skrytie prepíše len kópiu, placement v store ostane viditeľný a kalibrácia nedotknutá', () => {
    const placement = { visible: true, opacity: 0.6, affine: [1, 0, 0, 0, 1, 0] };
    const hiddenCopy = underlayIn3d(placement, undefined, true);
    assert.equal(hiddenCopy.visible, false);
    assert.deepEqual(hiddenCopy.affine, placement.affine);
    assert.equal(placement.visible, true);
    assert.equal(underlayIn3d(placement, undefined, false), placement);
  });

  it('podklad vypnutý okom (visible kalibrácie) ostane vypnutý aj po zapnutí v 3D', () => {
    const off = { visible: false, opacity: 0.6 };
    assert.equal(underlayIn3d(off, undefined, false).visible, false);
    assert.equal(underlayIn3d(off, undefined, true).visible, false);
  });

  it('správa SET_UNDERLAYS_3D prejde len s boolean show', () => {
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D', show: false }), true);
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D', show: true }), true);
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D', show: 'no' }), false);
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D' }), false);
  });

  it('SET_UNDERLAYS_3D s podkladmi (#323): položky s id a visible / opacity 0 až 1, only a persist len boolean', () => {
    const msg = (over: Record<string, unknown>) => isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D', ...over });
    assert.equal(msg({ underlays: [{ document_id: 'd2', visible: true }] }), true);
    assert.equal(msg({ show: true, underlays: [{ document_id: 'd2', opacity: 0 }], only: true, persist: false }), true);
    assert.equal(msg({ underlays: [{ document_id: 'd2' }] }), false);
    assert.equal(msg({ underlays: [{ document_id: 'd2', opacity: 1.5 }] }), false);
    assert.equal(msg({ underlays: [{ document_id: '', visible: true }] }), false);
    assert.equal(msg({ underlays: [{ document_id: 'd2', visible: true }], only: 'yes' }), false);
    assert.equal(msg({ only: true }), false);
    assert.equal(msg({ show: true, only: true }), false);
  });
});
