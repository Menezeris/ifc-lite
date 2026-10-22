/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { fitTabs } from './viewTabsFit.js';

const ids = ['3d', 'a', 'b', 'c', 'd', 'e'];
const base = { ids, activeId: '3d', besideId: null, slotWidth: 100, moreWidth: 40 };

describe('lišta záložiek: zoznam pretečených (AIM D-132, #240)', () => {
  it('keď sa zmestia všetky, nič nie je skryté', () => {
    assert.deepStrictEqual(fitTabs({ ...base, available: 600 }), { visible: ids, hidden: [] });
  });

  it('pri preteku sa odpočíta tlačidlo zoznamu a zvyšok ide do zoznamu', () => {
    const r = fitTabs({ ...base, available: 400 }); // (400 - 40) / 100 = 3 miesta
    assert.deepStrictEqual(r.visible, ['3d', 'a', 'b']);
    assert.deepStrictEqual(r.hidden, ['c', 'd', 'e']);
  });

  it('aktívna záložka z preteku je viditeľná, poradie ostáva pôvodné', () => {
    const r = fitTabs({ ...base, available: 400, activeId: 'e' });
    assert.deepStrictEqual(r.visible, ['3d', 'a', 'e']);
    assert.deepStrictEqual(r.hidden, ['b', 'c', 'd']);
  });

  it('záložka vedľa má prednosť pred ostatnými, aktívna pred záložkou vedľa', () => {
    assert.deepStrictEqual(fitTabs({ ...base, available: 400, activeId: 'c', besideId: 'e' }).visible, ['3d', 'c', 'e']);
    assert.deepStrictEqual(fitTabs({ ...base, available: 300, activeId: 'c', besideId: 'e' }).visible, ['3d', 'c']);
  });

  it('3D ostáva pripnutá aj v úzkej lište, aktívna sa nezmestí len keď je miesto jedno', () => {
    assert.deepStrictEqual(fitTabs({ ...base, available: 20, activeId: 'c' }).visible, ['3d']);
    assert.deepStrictEqual(fitTabs({ ...base, available: 20, activeId: 'c' }).hidden, ['a', 'b', 'c', 'd', 'e']);
  });

  it('neznáme id aktívnej alebo vedľa sa ignoruje', () => {
    const r = fitTabs({ ...base, available: 400, activeId: 'zzz', besideId: 'yyy' });
    assert.deepStrictEqual(r.visible, ['3d', 'a', 'b']);
  });

  it('presne na hranici sa zmestia všetky bez tlačidla', () => {
    assert.strictEqual(fitTabs({ ...base, available: 600 }).hidden.length, 0);
    assert.strictEqual(fitTabs({ ...base, available: 599 }).hidden.length, 1);
  });
});
