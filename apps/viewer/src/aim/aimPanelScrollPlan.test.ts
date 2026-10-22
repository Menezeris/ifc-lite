/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { centeredTop, isPanelScroll, rowVisible, scrollTarget } from './aimPanelScrollPlan.js';
import { isViewMessage } from './view-protocol.js';

const S = 'aim-bridge';

describe('posun panela vlastností (AIM #183)', () => {
  it('SCROLL_PANEL prejde obálkou mosta len so známym smerom', () => {
    for (const direction of ['up', 'down', 'top', 'bottom']) {
      assert.equal(isViewMessage({ source: S, type: 'SCROLL_PANEL', direction }), true);
    }
    assert.equal(isViewMessage({ source: S, type: 'SCROLL_PANEL', direction: 'left' }), false);
    assert.equal(isViewMessage({ source: S, type: 'SCROLL_PANEL' }), false);
    assert.equal(isPanelScroll(3), false);
  });

  it('down a up posúvajú o 80 % výšky a držia sa v rozsahu', () => {
    assert.equal(scrollTarget('down', 0, 500, 2000), 400);
    assert.equal(scrollTarget('down', 1400, 500, 2000), 1500);
    assert.equal(scrollTarget('up', 400, 500, 2000), 0);
    assert.equal(scrollTarget('up', 1000, 500, 2000), 600);
    assert.equal(scrollTarget('top', 900, 500, 2000), 0);
    assert.equal(scrollTarget('bottom', 0, 500, 2000), 1500);
    assert.equal(scrollTarget('bottom', 0, 500, 300), 0, 'obsah kratší ako okno');
  });

  it('centeredTop vycentruje riadok a neprekročí rozsah', () => {
    const view = { top: 100, height: 400 };
    // riadok 600 px pod vrchom okna, výška 20: stred okna = 200 -> posun o 600 - 190 = 410
    assert.equal(centeredTop({ top: 700, height: 20 }, view, 0, 3000), 410);
    assert.equal(centeredTop({ top: 110, height: 20 }, view, 50, 3000), 0, 'nie pod nulu');
    assert.equal(centeredTop({ top: 5000, height: 20 }, view, 0, 1000), 600, 'nie za koniec');
  });

  it('rowVisible vyžaduje riadok celý v okne s okrajom', () => {
    const view = { top: 100, height: 400 };
    assert.equal(rowVisible({ top: 300, height: 20 }, view), true);
    assert.equal(rowVisible({ top: 110, height: 20 }, view), false, 'v okraji hore');
    assert.equal(rowVisible({ top: 470, height: 20 }, view), false, 'v okraji dole');
    assert.equal(rowVisible({ top: 900, height: 20 }, view), false, 'pod oknom, ako riadok NetVolume v #183');
  });
});
