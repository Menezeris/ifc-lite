/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { useAimViewTabs } from '../viewTabsStore.js';
import { putTile, resizeTiles } from '../viewTabsApply.js';

/** Živá 3D dlaždica je dlaždica 0 v `split_h` (AIM #299). */
function tiled(layout: 'split_h' | 'grid4', sizes?: number[]) {
  useAimViewTabs.setState({ layout, tiles: ['3d', null], sizes, sceneId: '3d', frame: null });
}

describe('podiely dlaždíc v lište (AIM #299)', () => {
  beforeEach(() => tiled('split_h'));

  it('resizeTiles zapíše normalizované podiely a prepočíta rámec živej dlaždice', () => {
    resizeTiles([1, 3]);
    const s = useAimViewTabs.getState();
    assert.deepEqual(s.sizes, [0.25, 0.75]);
    assert.match(s.frame?.width ?? '', /^calc\(25% - 2px\)$/, 'živá 3D dlaždica má štvrtinu plochy');
  });

  it('null vráti polovice, zlý počet alebo grid4 stav nezmení', () => {
    resizeTiles([1, 3]);
    resizeTiles(null);
    assert.equal(useAimViewTabs.getState().sizes, undefined);
    assert.match(useAimViewTabs.getState().frame?.width ?? '', /^calc\(50% - 2px\)$/);
    resizeTiles([1, 2, 3]);
    assert.equal(useAimViewTabs.getState().sizes, undefined, 'tri hodnoty do dvojice');
    tiled('grid4');
    resizeTiles([1, 3]);
    assert.equal(useAimViewTabs.getState().sizes, undefined, 'grid4 podiely nemá');
  });
});

describe('výber záložky do dlaždice (AIM #299 doplnok)', () => {
  it('putTile nechá potiahnutý pomer, nevráti polovice', () => {
    tiled('split_h', [0.3, 0.7]);
    putTile(1, null);
    const s = useAimViewTabs.getState();
    assert.deepEqual(s.sizes, [0.3, 0.7]);
    assert.match(s.frame?.width ?? '', /^calc\(30% - 2px\)$/, 'živá 3D dlaždica ostáva na 30 %');
  });
});
