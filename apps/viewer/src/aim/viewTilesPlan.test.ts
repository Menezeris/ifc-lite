/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { initialTabs, openTab, closeTab, type ViewTab, type ViewTabsState } from './viewTabsPlan.js';
import {
  TILE_LAYOUTS, TILE_RECTS, describeLayout, isTileLayout, layoutTiles, liveTile, placeTab, reconcileTiles, setTile,
  singleTiles, tileScene, type TilesState,
} from './viewTilesPlan.js';
import { isTilesMessage } from './tiles-protocol.js';

const plan1: ViewTab = { id: 'plan:G1', kind: 'plan', label: '1NP', storeyGuid: 'G1' };
const plan2: ViewTab = { id: 'plan:G2', kind: 'plan', label: '2NP', storeyGuid: 'G2' };
const docA: ViewTab = { id: 'doc:A', kind: 'doc', label: 'A.pdf', docId: 'A' };
const docB: ViewTab = { id: 'doc:B', kind: 'doc', label: 'B.pdf', docId: 'B' };

/** 3D, 1NP, 2NP, A.pdf otvorené; aktívna 3D. */
function four(): ViewTabsState {
  const s = openTab(openTab(openTab(openTab(initialTabs(), plan1), plan2), docA), { ...initialTabs().tabs[0] });
  return { ...s, activeId: '3d' };
}

describe('dlaždice záložiek (AIM D-157)', () => {
  it('každé rozloženie má 1 až 4 dlaždice, ktoré pokryjú plochu bez prekrytia', () => {
    for (const layout of TILE_LAYOUTS) {
      const rects = TILE_RECTS[layout];
      assert.ok(rects.length >= 1 && rects.length <= 4, layout);
      const area = rects.reduce((a, t) => a + t.w * t.h, 0);
      assert.ok(Math.abs(area - 1) < 1e-9, `${layout}: plocha ${area}`);
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          assert.ok(ox <= 1e-9 || oy <= 1e-9, `${layout}: ${i} a ${j} sa prekrývajú`);
        }
      }
    }
    assert.deepStrictEqual(TILE_LAYOUTS.map((l) => TILE_RECTS[l].length), [1, 2, 2, 3, 3, 3, 3, 3, 3, 4]);
  });

  it('pri troch oknách je dlaždica 0 tá veľká a sedí so stranou', () => {
    assert.deepStrictEqual(TILE_RECTS.three_left[0], { x: 0, y: 0, w: 0.5, h: 1 });
    assert.deepStrictEqual(TILE_RECTS.three_right[0], { x: 0.5, y: 0, w: 0.5, h: 1 });
    assert.deepStrictEqual(TILE_RECTS.three_top[0], { x: 0, y: 0, w: 1, h: 0.5 });
    assert.deepStrictEqual(TILE_RECTS.three_bottom[0], { x: 0, y: 0.5, w: 1, h: 0.5 });
  });

  it('isTileLayout pozná len rozloženia zo zoznamu', () => {
    assert.ok(isTileLayout('grid4'));
    assert.ok(!isTileLayout('2x2'));
    assert.ok(!isTileLayout(3));
  });

  it('layoutTiles: požadované záložky, doplnenie aktívnou a ostatnými, bez opakovania', () => {
    const s = four();
    assert.deepStrictEqual(layoutTiles(s, singleTiles(), 'split_h', ['3d', 'plan:G1']).tiles, ['3d', 'plan:G1']);
    // Doplnenie: najprv aktívna, potom poradie lišty.
    assert.deepStrictEqual(layoutTiles(s, singleTiles(), 'grid4').tiles, ['3d', 'plan:G1', 'plan:G2', 'doc:A']);
    // Opakovaná a neotvorená záložka sa nahradí doplnením; null = prázdna dlaždica.
    assert.deepStrictEqual(layoutTiles(s, singleTiles(), 'three_h', ['plan:G2', 'plan:G2', 'doc:X']).tiles, ['plan:G2', '3d', 'plan:G1']);
    assert.deepStrictEqual(layoutTiles(s, singleTiles(), 'split_v', [undefined, null]).tiles, ['3d', null]);
    // Málo záložiek = prázdne dlaždice.
    assert.deepStrictEqual(layoutTiles(initialTabs(), singleTiles(), 'split_h').tiles, ['3d', null]);
    assert.deepStrictEqual(layoutTiles(s, singleTiles(), 'single'), singleTiles());
  });

  it('zmena rozloženia drží doterajšie dlaždice v poradí', () => {
    const s = four();
    const grid: TilesState = { layout: 'grid4', tiles: ['doc:A', 'plan:G2', '3d', 'plan:G1'] };
    assert.deepStrictEqual(layoutTiles(s, grid, 'three_left').tiles, ['doc:A', 'plan:G2', '3d']);
  });

  it('placeTab: prázdna dlaždica, potom rovnaký druh mimo živej 3D, potom posledná mimo živej', () => {
    let s = openTab(four(), docB);
    s = { ...s, activeId: '3d' };
    assert.deepStrictEqual(placeTab(s, { layout: 'split_h', tiles: ['3d', null] }, 'doc:B', '3d').tiles, ['3d', 'doc:B']);
    // Dokument nahradí dokument, nie 3D pôdorys.
    assert.deepStrictEqual(placeTab(s, { layout: 'three_left', tiles: ['3d', 'doc:A', 'plan:G1'] }, 'doc:B', '3d').tiles, ['3d', 'doc:B', 'plan:G1']);
    // 3D záložka nahradí 3D dlaždicu so snímkou, nie živú.
    assert.deepStrictEqual(placeTab(s, { layout: 'three_left', tiles: ['3d', 'plan:G1', 'doc:A'] }, 'plan:G2', '3d').tiles, ['3d', 'plan:G2', 'doc:A']);
    // Bez rovnakého druhu: posledná mimo živej.
    assert.deepStrictEqual(placeTab(s, { layout: 'split_h', tiles: ['3d', 'plan:G1'] }, 'doc:B', 'plan:G1').tiles, ['doc:B', 'plan:G1']);
    // Už ukázaná alebo bez dlaždíc: bez zmeny.
    const t: TilesState = { layout: 'split_h', tiles: ['3d', 'doc:A'] };
    assert.strictEqual(placeTab(s, t, 'doc:A', '3d'), t);
    assert.deepStrictEqual(placeTab(s, singleTiles(), 'doc:A', '3d'), singleTiles());
  });

  it('setTile vloží záložku a pri duplicite dlaždice vymení', () => {
    const s = four();
    const t: TilesState = { layout: 'split_h', tiles: ['3d', 'plan:G1'] };
    assert.deepStrictEqual(setTile(s, t, 1, 'doc:A').tiles, ['3d', 'doc:A']);
    assert.deepStrictEqual(setTile(s, t, 1, '3d').tiles, ['plan:G1', '3d']);
    assert.deepStrictEqual(setTile(s, t, 0, null).tiles, [null, 'plan:G1']);
    assert.strictEqual(setTile(s, t, 2, 'doc:A'), t);
    assert.strictEqual(setTile(s, t, 0, 'doc:X'), t);
  });

  it('reconcileTiles: zavretá záložka uvoľní dlaždicu pre neukázanú, aktívna sa dostane do dlaždice', () => {
    let s = four();
    const t: TilesState = { layout: 'split_h', tiles: ['3d', 'plan:G1'] };
    s = closeTab({ ...s, activeId: '3d' }, 'plan:G1');
    assert.deepStrictEqual(reconcileTiles(s, t, '3d').tiles, ['3d', 'plan:G2']);
    // Prázdna dlaždica ostane prázdna, kým ju nevyplní aktívna.
    const one: ViewTabsState = { ...initialTabs() };
    assert.deepStrictEqual(reconcileTiles(one, { layout: 'split_h', tiles: ['3d', 'plan:G9'] }, '3d').tiles, ['3d', null]);
    // Aktivovaný dokument mimo dlaždíc nahradí dokument.
    const withB = openTab(four(), docB);
    assert.deepStrictEqual(reconcileTiles(withB, { layout: 'split_h', tiles: ['3d', 'doc:A'] }, '3d').tiles, ['3d', 'doc:B']);
  });

  it('tileScene: aktívna 3D, inak doterajšia v dlaždici, inak prvá 3D dlaždica', () => {
    const s = four();
    const t: TilesState = { layout: 'split_h', tiles: ['doc:A', 'plan:G1'] };
    assert.strictEqual(tileScene({ ...s, activeId: 'plan:G2' }, t, '3d'), 'plan:G2');
    assert.strictEqual(tileScene({ ...s, activeId: 'doc:A' }, t, 'plan:G1'), 'plan:G1');
    assert.strictEqual(tileScene({ ...s, activeId: 'doc:A' }, t, '3d'), 'plan:G1');
    // Doterajšia živá ostane živá, aj keď nie je prvá 3D dlaždica.
    assert.strictEqual(tileScene({ ...s, activeId: 'doc:A' }, { layout: 'three_h', tiles: ['plan:G1', 'doc:A', 'plan:G2'] }, 'plan:G2'), 'plan:G2');
    assert.strictEqual(tileScene({ ...s, activeId: 'doc:A' }, { layout: 'split_h', tiles: ['doc:A', null] }, '3d'), '3d');
  });

  it('describeLayout: dlaždice s menovkou, živá 3D a snímky', () => {
    const s = four();
    const t: TilesState = { layout: 'three_left', tiles: ['3d', 'plan:G1', null] };
    assert.strictEqual(liveTile(t, 'plan:G1'), 1);
    assert.strictEqual(liveTile(singleTiles(), '3d'), -1);
    assert.deepStrictEqual(describeLayout(s, t, '3d'), {
      kind: 'three_left',
      tiles: [
        { index: 0, tab: '3d', label: '3D', kind: '3d', live: true },
        { index: 1, tab: 'plan:G1', label: '1NP', kind: 'plan', live: false },
        { index: 2, tab: null },
      ],
      live_tab: '3d',
    });
    assert.strictEqual(describeLayout(s, { layout: 'split_h', tiles: ['doc:A', null] }, '3d').live_tab, null);
    assert.deepStrictEqual(describeLayout(s, singleTiles(), '3d'), { kind: 'single' });
  });

  it('VIEW_TABS layout: rozloženie zo zoznamu, najviac toľko dlaždíc, dlaždica {tab} | {plan} | null', () => {
    const m = (o: Record<string, unknown>) => ({ source: 'aim-bridge', type: 'VIEW_TABS', action: 'layout', ...o });
    assert.ok(isTilesMessage(m({ layout: 'grid4' })));
    assert.ok(isTilesMessage(m({ layout: 'split_h', tiles: [{ tab: '3D' }, { plan: 'G1' }] })));
    assert.ok(isTilesMessage(m({ layout: 'three_v', tiles: [null] })));
    assert.ok(!isTilesMessage(m({ layout: '2x2' })));
    assert.ok(!isTilesMessage(m({ layout: 'split_v', tiles: [{ tab: 'a' }, { tab: 'b' }, { tab: 'c' }] })));
    assert.ok(!isTilesMessage(m({ layout: 'split_h', tiles: [{ tab: '3D', plan: 'G1' }] })));
    assert.ok(!isTilesMessage(m({ layout: 'split_h', tiles: [{ tab: '' }] })));
    assert.ok(!isTilesMessage({ ...m({ layout: 'single' }), source: 'x' }));
    assert.ok(!isTilesMessage({ ...m({ layout: 'single' }), action: 'open' }));
  });
});
