/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isViewMessage, isPanelsRequest } from './view-protocol.js';
import { PANEL_KEYS, describePanels, panelInfo, planPanels, type PanelsStateLike } from './aimPanelsPlan.js';

const S = 'aim-bridge' as const;

const base: PanelsStateLike = {
  leftPanelCollapsed: false,
  sidebarMode: 'expanded',
  sidebarActivePanel: 'lens',
  sidebarSecondaryPanel: null,
  sidebarWidthPct: 22.4,
  floatingPanels: [],
  poppedOutIds: [],
  listPanelVisible: false,
};

describe('panely z chatu (AIM D-127)', () => {
  it('SET_PANELS: známe panely a akcie, all len close, aspoň jedna položka', () => {
    assert.equal(isViewMessage({ source: S, type: 'SET_PANELS', panels: { lens: 'close' } }), true);
    assert.equal(isViewMessage({ source: S, type: 'SET_PANELS', panels: { all: 'close', properties: 'open' } }), true);
    assert.equal(isPanelsRequest({ all: 'open' }), false);
    assert.equal(isPanelsRequest({ 'legend!': 'close' }), false, 'meno musí byť identifikátor');
    assert.equal(isPanelsRequest({ legend: 'close' }), true, 'neznáme meno prejde, viewer ho nahlási v APPLIED');
    assert.equal(isPanelsRequest({ lens: 'hide' }), false);
    assert.equal(isPanelsRequest({}), false);
    assert.equal(isPanelsRequest([]), false);
    assert.equal(isViewMessage({ source: S, type: 'SET_PANELS' }), false);
  });

  it('plán: all zavrie všetko okrem výslovne otvorených, zatváranie ide prvé, toggle podľa stavu', () => {
    const open = new Set(['lens', 'model_tree']);
    const { steps } = planPanels({ all: 'close', properties: 'open' }, (k) => open.has(k));
    assert.deepEqual(steps.at(-1), { key: 'properties', open: true });
    assert.equal(steps.filter((s) => s.open).length, 1);
    assert.equal(steps.length, PANEL_KEYS.length);
    assert.deepEqual(planPanels({ lens: 'toggle', lists: 'toggle' }, (k) => open.has(k)).steps, [
      { key: 'lens', open: false },
      { key: 'lists', open: true },
    ]);
    const closeAll = planPanels({ all: 'close' }, () => true).steps;
    assert.equal(closeAll.at(-1)?.key, 'properties', 'vlastnosti sa zatvárajú ako posledné, inak by ich zatvorený panel stĺpca vrátil');
    assert.deepEqual(planPanels({ bcf: 'open', nezname: 'close' }, () => false), { steps: [{ key: 'bcf', open: true }], unknown: ['nezname'] });
  });

  it('stav: ukotvený vpravo, vľavo, dole, plávajúci so snapom a veľkosťou, samostatné okno', () => {
    assert.deepEqual(panelInfo(base, 'lens'), { open: true, where: 'right' });
    assert.deepEqual(panelInfo(base, 'properties'), { open: false });
    assert.deepEqual(panelInfo(base, 'model_tree'), { open: true, where: 'left' });
    assert.deepEqual(panelInfo({ ...base, listPanelVisible: true }, 'lists'), { open: true, where: 'bottom' });
    const floating = { ...base, floatingPanels: [{ id: 'lens', snap: 'right', w: 360.4, h: 459.6 }] };
    assert.deepEqual(panelInfo(floating, 'lens'), { open: true, where: 'floating', snap: 'right', size: { w: 360, h: 460 } });
    assert.deepEqual(panelInfo({ ...base, poppedOutIds: ['documents'] }, 'documents'), { open: true, where: 'window' });
    assert.deepEqual(panelInfo({ ...base, sidebarMode: 'collapsed' }, 'lens'), { open: false });
    assert.deepEqual(panelInfo({ ...base, sidebarSecondaryPanel: 'drawing-underlay' }, 'underlays'), { open: true, where: 'right' });
    const all = describePanels(base);
    assert.equal(all.right_width_pct, 22);
    assert.equal(describePanels({ ...base, sidebarMode: 'collapsed' }).right_width_pct, null);
  });

  it('stav: spodný pás a panely bez príznaka (BCF Alt+3, Script, Gantt, zones)', () => {
    assert.deepEqual(panelInfo({ ...base, sidebarActivePanel: 'bcf' }, 'bcf'), { open: true, where: 'right' });
    assert.deepEqual(panelInfo(base, 'bcf'), { open: false });
    assert.deepEqual(panelInfo({ ...base, scriptPanelVisible: true }, 'script'), { open: true, where: 'bottom' });
    assert.deepEqual(panelInfo({ ...base, ganttPanelVisible: false }, 'gantt'), { open: false });
    assert.deepEqual(panelInfo({ ...base, sidebarActivePanel: 'zones' }, 'zones'), { open: true, where: 'right' });
  });
});
