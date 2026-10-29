/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Panel Underlays ukáže, že podklady v 3D sú vypnuté (AIMviewer#280): stav prepínača,
 * pás nad zoznamom a poznámka pri riadku so zapnutým okom. Zamknutý pôdorys (2D) ich kreslí,
 * takže tam pás ani poznámka nie sú.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { render, cleanup } from '@/test/render.js';
import { useAimUnderlays3d } from './aimUnderlays3d.js';
import { AimUnderlays3dOffBanner, AimUnderlays3dToggle, AimUnderlayRowNote } from './AimUnderlays3dToggle.js';
import { aimForkEn } from '@/i18n/catalogues/aim-fork.en';

const q = (root: HTMLElement, id: string) => root.querySelector(`[data-testid="${id}"]`);
// Boolean on purpose: a failed assert.equal on a DOM element would print the whole happy-dom tree.
const has = (root: HTMLElement, id: string) => q(root, id) !== null;

function mount(rowVisible = true, viewLocked = false): HTMLElement {
  return render(
    <>
      <AimUnderlays3dOffBanner viewLocked={viewLocked} />
      <AimUnderlayRowNote visible={rowVisible} viewLocked={viewLocked} />
      <AimUnderlays3dToggle />
    </>,
  );
}

describe('podklady v 3D vypnuté sú v paneli vidieť (AIMviewer#280)', () => {
  beforeEach(() => {
    useAimUnderlays3d.setState({ hidden: true });
  });
  afterEach(cleanup);

  it('vypnuté: pás, poznámka pri riadku a stav Off', () => {
    const ui = mount();
    assert.equal(q(ui, 'aim-underlays-3d-off')?.textContent, aimForkEn['aimFork.underlays3d.offNotice']);
    assert.equal(q(ui, 'aim-underlay-row-off')?.textContent, aimForkEn['aimFork.underlays3d.rowNote']);
    assert.equal(q(ui, 'aim-underlays-3d-state')?.textContent, aimForkEn['aimFork.underlays3d.stateOff']);
    assert.equal(ui.querySelector('[role="switch"]')?.getAttribute('aria-checked'), 'false');
  });

  it('zapnuté: bez pásu a poznámky, stav On; vypnutie z chatu (setShown) ich vráti', () => {
    const ui = mount();
    act(() => useAimUnderlays3d.getState().setShown(true));
    assert.equal(has(ui, 'aim-underlays-3d-off'), false);
    assert.equal(has(ui, 'aim-underlay-row-off'), false);
    assert.equal(q(ui, 'aim-underlays-3d-state')?.textContent, aimForkEn['aimFork.underlays3d.stateOn']);
    act(() => useAimUnderlays3d.getState().setShown(false));
    assert.equal(has(ui, 'aim-underlays-3d-off'), true);
    assert.equal(has(ui, 'aim-underlay-row-off'), true);
  });

  it('riadok s vypnutým okom poznámku nemá (oko to už hovorí)', () => {
    const ui = mount(false);
    assert.equal(has(ui, 'aim-underlays-3d-off'), true);
    assert.equal(has(ui, 'aim-underlay-row-off'), false);
  });

  it('zamknutý pôdorysný pohľad (2D) podklady kreslí: bez pásu a poznámky', () => {
    const ui = mount(true, true);
    assert.equal(has(ui, 'aim-underlays-3d-off'), false);
    assert.equal(has(ui, 'aim-underlay-row-off'), false);
  });
});
