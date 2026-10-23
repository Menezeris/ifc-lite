/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cutInStorey, nextLevel, pickStoreyView, type StoreyLevel } from './storeyViews.js';

const STOREYS: StoreyLevel[] = [
  { guid: 'g0', name: '1NP', elevation: 0 },
  { guid: 'g1', name: '2NP', elevation: 3.2 },
  { guid: 'g2', name: '3NP', elevation: 6.4 },
];

describe('uložený pohľad podlažia odvodene z rezu (AIM D-161)', () => {
  it('nextLevel: najbližšie vyššie podlažie, najvyššie nemá strop', () => {
    assert.equal(nextLevel(STOREYS, 0), 3.2);
    assert.equal(nextLevel(STOREYS, 3.2), 6.4);
    assert.equal(nextLevel(STOREYS, 6.4), Number.POSITIVE_INFINITY);
  });

  it('nextLevel: podlažie federovaného modelu na tej istej úrovni sa neráta ako vyššie', () => {
    assert.equal(nextLevel([...STOREYS, { guid: 'x', name: '1NP VZT', elevation: 0 }], 0), 3.2);
  });

  it('cutInStorey: rez na podlahe patrí podlažiu, rez v úrovni vyššieho už nie', () => {
    assert.equal(cutInStorey(1.2, 0, 3.2), true);
    assert.equal(cutInStorey(0, 0, 3.2), true);
    assert.equal(cutInStorey(3.2, 0, 3.2), false);
    assert.equal(cutInStorey(-0.5, 0, 3.2), false);
  });

  it('nájde pohľad s rezom 1,2 m nad podlahou správneho podlažia', () => {
    const views = [
      { id: 'a', name: 'Basket 1', cutZ: [] },
      { id: 'b', name: 'Basket 2', cutZ: [4.4] },
    ];
    assert.equal(pickStoreyView(views, STOREYS, 'g1'), 'b');
    assert.equal(pickStoreyView(views, STOREYS, 'g0'), null);
  });

  it('viac zhôd: vyhrá meno podlažia, inak prvý', () => {
    const views = [
      { id: 'a', name: 'Rez A', cutZ: [1.2] },
      { id: 'b', name: 'Pôdorys 1NP', cutZ: [1.5] },
    ];
    assert.equal(pickStoreyView(views, STOREYS, 'g0'), 'b');
    assert.equal(pickStoreyView([views[0], { id: 'c', name: 'Iný', cutZ: [2] }], STOREYS, 'g0'), 'a');
  });

  it('neznáme podlažie alebo pohľady bez rezu: null', () => {
    assert.equal(pickStoreyView([{ id: 'a', name: 'x', cutZ: [1] }], STOREYS, 'nope'), null);
    assert.equal(pickStoreyView([{ id: 'a', name: 'x', cutZ: [] }], STOREYS, 'g0'), null);
  });
});
