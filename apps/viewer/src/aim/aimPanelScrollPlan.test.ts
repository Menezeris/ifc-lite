/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { centeredTop, foldText, isPanelScroll, isPanelScrollRequest, isPanelZoom, percentTarget, rowVisible, scrollPercent, scrollTarget, zoomTarget } from './aimPanelScrollPlan.js';
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

  it('SCROLL_PANEL: práve jedno z direction, item, percent; panel je identifikátor (D-150)', () => {
    const ok = (m: Record<string, unknown>) => isViewMessage({ source: S, type: 'SCROLL_PANEL', ...m });
    assert.equal(ok({ panel: 'bcf', direction: 'down' }), true);
    assert.equal(ok({ panel: 'bcf', item: 'Dvere D12' }), true);
    assert.equal(ok({ panel: 'lists', percent: 50 }), true);
    assert.equal(ok({ percent: 0 }), true);
    assert.equal(ok({ direction: 'down', percent: 5 }), false, 'dva druhy cieľa naraz');
    assert.equal(ok({ item: '   ' }), false);
    assert.equal(ok({ item: 'x'.repeat(81) }), false);
    assert.equal(ok({ percent: 101 }), false);
    assert.equal(ok({ percent: Number.NaN }), false);
    assert.equal(ok({ panel: 'bad name', direction: 'up' }), false);
    assert.equal(isPanelScrollRequest({}), false);
  });

  it('poloha v % a spätné číslo sedia, krátky obsah dá 0', () => {
    assert.equal(percentTarget(50, 500, 2000), 750);
    assert.equal(percentTarget(100, 500, 2000), 1500);
    assert.equal(percentTarget(-5, 500, 2000), 0);
    assert.equal(percentTarget(50, 500, 300), 0);
    assert.equal(scrollPercent(750, 500, 2000), 50);
    assert.equal(scrollPercent(0, 500, 300), 0);
  });

  it('hľadanie položky ignoruje diakritiku, veľkosť písmen a medzery', () => {
    assert.equal(foldText('  Čistý   Objem '), 'cisty objem');
    assert.ok(foldText('NetVolume (m³)').includes(foldText('netvolume')));
  });

  it('ZOOM_PANEL: in / out po kroku 1,25, reset, číslo, rozsah 0,5 až 2,5', () => {
    const ok = (zoom: unknown, extra: Record<string, unknown> = {}) => isViewMessage({ source: S, type: 'ZOOM_PANEL', zoom, ...extra });
    assert.equal(ok('in'), true);
    assert.equal(ok(1.5, { panel: 'bcf' }), true);
    assert.equal(ok(3), false);
    assert.equal(ok(0.4), false);
    assert.equal(ok('big'), false);
    assert.equal(ok('in', { panel: 'a b' }), false);
    assert.equal(isPanelZoom('reset'), true);
    assert.equal(zoomTarget('in', 1), 1.25);
    assert.equal(zoomTarget('out', 1.25), 1);
    assert.equal(zoomTarget('in', 2.4), 2.5, 'strop');
    assert.equal(zoomTarget('out', 0.55), 0.5, 'spodok');
    assert.equal(zoomTarget('reset', 2), 1);
    assert.equal(zoomTarget(1.8, 1), 1.8);
  });
});

