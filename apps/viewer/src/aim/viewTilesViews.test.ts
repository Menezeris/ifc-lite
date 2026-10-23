/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { dropViewTabs, initialTabs, resolveTabRef, syncViewTabs, viewTabId, describeTabs, type ViewTab, type ViewTabsState } from './viewTabsPlan.js';
import { addTile, describeLayout, isTiled, type TilesState } from './viewTilesPlan.js';
import { isTilesMessage } from './tiles-protocol.js';
import { SOURCE } from './bridge-protocol.js';

const view = (id: string, label: string): ViewTab => ({ id: viewTabId(id), kind: 'view', label, viewId: id });
const withViews = (...v: ViewTab[]): ViewTabsState => ({ ...initialTabs(), tabs: [...initialTabs().tabs, ...v] });

describe('pohľady z Presentation v dlaždiciach (AIM D-161, Fork B)', () => {
  it('syncViewTabs: premenovanie zmení menovku, zmazaný pohľad záložku zavrie', () => {
    const s = withViews(view('a', 'Pôdorys 1NP'), view('b', 'Rez A'));
    const next = syncViewTabs(s, [{ id: 'a', name: 'Pôdorys 1NP (nový)' }, { id: 'c', name: 'Iný' }]);
    assert.deepStrictEqual(next.tabs.map((t) => [t.id, t.label]), [['3d', '3D'], ['view:a', 'Pôdorys 1NP (nový)']]);
    // Bez zmeny sa vráti ten istý objekt (žiadny zbytočný zápis do store).
    assert.strictEqual(syncViewTabs(s, [{ id: 'a', name: 'Pôdorys 1NP' }, { id: 'b', name: 'Rez A' }]), s);
  });

  it('zmazaný pohľad, ktorý je aktívny, vráti aktívnu záložku na susednú', () => {
    const s = { ...withViews(view('a', 'A')), activeId: 'view:a' };
    assert.strictEqual(syncViewTabs(s, []).activeId, '3d');
  });

  it('dropViewTabs: bez dlaždíc záložky pohľadov zanikajú a aktívna sa vráti na 3D', () => {
    const s = { ...withViews(view('a', 'A')), activeId: 'view:a', besideId: null };
    assert.deepStrictEqual(dropViewTabs(s), { tabs: [initialTabs().tabs[0]], activeId: '3d', besideId: null });
    const plain = initialTabs();
    assert.strictEqual(dropViewTabs(plain), plain);
  });

  it('resolveTabRef nájde pohľad podľa menovky, id záložky aj id pohľadu', () => {
    const s = withViews(view('uuid-1', 'Rez A'));
    assert.strictEqual(resolveTabRef(s, 'rez a')?.id, 'view:uuid-1');
    assert.strictEqual(resolveTabRef(s, 'view:uuid-1')?.id, 'view:uuid-1');
    assert.strictEqual(resolveTabRef(s, 'UUID-1')?.id, 'view:uuid-1');
  });

  it('addTile: bez dlaždíc dve vedľa seba, potom prázdna dlaždica, potom väčšie rozloženie, grid4 nahradí neživú', () => {
    const s = withViews(view('a', 'A'), view('b', 'B'), view('c', 'C'), view('d', 'D'));
    const single: TilesState = { layout: 'single', tiles: [] };
    assert.deepStrictEqual(addTile(s, single, 'view:a', '3d'), { layout: 'split_h', tiles: ['3d', 'view:a'] });
    const two: TilesState = { layout: 'split_h', tiles: ['3d', 'view:a'] };
    assert.deepStrictEqual(addTile(s, two, 'view:b', '3d'), { layout: 'three_left', tiles: ['3d', 'view:a', 'view:b'] });
    assert.deepStrictEqual(addTile(s, { layout: 'split_v', tiles: ['3d', 'view:a'] }, 'view:b', '3d').layout, 'three_top');
    assert.deepStrictEqual(addTile(s, { layout: 'three_left', tiles: ['3d', 'view:a', 'view:b'] }, 'view:c', '3d'), { layout: 'grid4', tiles: ['3d', 'view:a', 'view:b', 'view:c'] });
    assert.deepStrictEqual(addTile(s, { layout: 'split_h', tiles: ['3d', null] }, 'view:a', '3d').tiles, ['3d', 'view:a']);
    const full: TilesState = { layout: 'grid4', tiles: ['3d', 'view:a', 'view:b', 'view:c'] };
    assert.deepStrictEqual(addTile(s, full, 'view:d', 'view:c').tiles, ['3d', 'view:a', 'view:d', 'view:c']);
    // Už ukázaný pohľad sa neduplikuje.
    assert.strictEqual(addTile(s, two, 'view:a', '3d'), two);
    assert.ok(isTiled(addTile(s, single, 'view:a', '3d')));
  });

  it('describeLayout a describeTabs nesú pohľad dlaždice (id aj meno)', () => {
    const s = withViews(view('a', 'Rez A'));
    const t: TilesState = { layout: 'split_h', tiles: ['3d', 'view:a'] };
    assert.deepStrictEqual(describeLayout(s, t, 'view:a'), {
      kind: 'split_h',
      tiles: [
        { index: 0, tab: '3d', label: '3D', kind: '3d', live: false },
        { index: 1, tab: 'view:a', label: 'Rez A', kind: 'view', view_id: 'a', view: 'Rez A', live: true },
      ],
      live_tab: 'view:a',
    });
    assert.strictEqual(describeTabs(s).find((x) => x.id === 'view:a')?.view_id, 'a');
  });

  it('VIEW_TABS layout prijme dlaždicu {view}, ale nie {view} s prázdnym textom alebo s ďalším kľúčom', () => {
    const msg = (tiles: unknown) => ({ source: SOURCE, type: 'VIEW_TABS', action: 'layout', layout: 'split_h', tiles });
    assert.ok(isTilesMessage(msg([{ tab: '3d' }, { view: 'Rez A' }])));
    assert.ok(!isTilesMessage(msg([{ view: '  ' }])));
    assert.ok(!isTilesMessage(msg([{ view: 'a', tab: 'b' }])));
  });
});
