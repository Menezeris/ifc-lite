/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { useAimUnderlays3d, underlaysHiddenIn3d, withUnderlay3dVisibility, skipUnderlayRaster } from './aimUnderlays3d.js';
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
    const placement = { visible: true, affine: [1, 0, 0, 0, 1, 0] };
    const hiddenCopy = withUnderlay3dVisibility(placement, true);
    assert.equal(hiddenCopy.visible, false);
    assert.deepEqual(hiddenCopy.affine, placement.affine);
    assert.equal(placement.visible, true);
    assert.equal(withUnderlay3dVisibility(placement, false), placement);
  });

  it('podklad vypnutý okom (visible kalibrácie) ostane vypnutý aj po zapnutí v 3D', () => {
    const off = { visible: false };
    assert.equal(withUnderlay3dVisibility(off, false).visible, false);
    assert.equal(withUnderlay3dVisibility(off, true).visible, false);
  });

  it('správa SET_UNDERLAYS_3D prejde len s boolean show', () => {
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D', show: false }), true);
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D', show: true }), true);
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D', show: 'no' }), false);
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_UNDERLAYS_3D' }), false);
  });
});
