/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isViewMessage, isPanelsRequest } from './view-protocol.js';
import { PANEL_KEYS, describePanels, panelInfo, planPanelLayout, planPanels, type PanelsStateLike } from './aimPanelsPlan.js';

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

describe('šírka a strana panela (AIM #320)', () => {
  it('SET_PANELS panel_layout: platí aj bez panels, rozsah šírky a strany, nesmie byť prázdne', () => {
    const ok = (o: Record<string, unknown>) => isViewMessage({ source: S, type: 'SET_PANELS', ...o });
    assert.equal(ok({ panel_layout: { panel: 'properties', width_pct: 40 } }), true);
    assert.equal(ok({ panels: { properties: 'open' }, panel_layout: { panel: 'properties', side: 'left' } }), true);
    assert.equal(ok({ panel_layout: { panel: 'properties', width_pct: 4 } }), false);
    assert.equal(ok({ panel_layout: { panel: 'properties', width_pct: 91 } }), false);
    assert.equal(ok({ panel_layout: { panel: 'properties', side: 'top' } }), false);
    assert.equal(ok({ panel_layout: { panel: 'properties' } }), false, 'bez šírky aj strany nie je čo nastaviť');
    assert.equal(ok({ panel_layout: { panel: 'bad name', width_pct: 30 } }), false);
    assert.equal(ok({ panel_layout: { width_pct: 30 } }), false);
    assert.equal(ok({}), false, 'ani panels, ani panel_layout');
    assert.equal(ok({ panels: { lens: 'close' }, panel_layout: 'x' }), false);
  });

  it('pravý stĺpec: šírka ide do stĺpca, strana right nič nemení, left vytrhne panel a pripne', () => {
    const docked = { open: true, where: 'right' as const };
    assert.deepEqual(planPanelLayout({ panel: 'properties', width_pct: 40 }, docked, 1600), { sidebarWidthPct: 40, issues: [] });
    assert.deepEqual(planPanelLayout({ panel: 'properties', side: 'right' }, docked, 1600), { issues: [] });
    assert.deepEqual(planPanelLayout({ panel: 'properties', side: 'left', width_pct: 25 }, docked, 1600), { float: 'left', floatWidthPx: 400, issues: [] });
  });

  it('plávajúci panel: šírka v px z % okna (min 240, max 90 % okna), re-snap len keď sa líši', () => {
    const floating = { open: true, where: 'floating' as const, snap: 'right', size: { w: 360, h: 460 } };
    assert.equal(planPanelLayout({ panel: 'lens', width_pct: 30 }, floating, 1000).floatWidthPx, 300);
    assert.equal(planPanelLayout({ panel: 'lens', width_pct: 5 }, floating, 1000).floatWidthPx, 240);
    assert.equal(planPanelLayout({ panel: 'lens', width_pct: 90 }, floating, 500).floatWidthPx, 450);
    assert.equal(planPanelLayout({ panel: 'lens', side: 'right' }, floating, 1000).float, undefined);
    assert.equal(planPanelLayout({ panel: 'lens', side: 'left' }, floating, 1000).float, 'left');
  });

  it('čo viewer nevie, sa hlási ako problém a nič sa nemení', () => {
    const closed = planPanelLayout({ panel: 'lens', width_pct: 30 }, { open: false }, 1000);
    assert.equal(closed.issues.length, 1);
    assert.equal(closed.sidebarWidthPct, undefined);
    assert.equal(planPanelLayout({ panel: 'hierarchy', width_pct: 30 }, { open: true, where: 'left' }, 1000).issues.length, 1);
    assert.equal(planPanelLayout({ panel: 'lens', width_pct: 30 }, { open: true, where: 'window' }, 1000).issues.length, 1);
    const bottom = planPanelLayout({ panel: 'clash', width_pct: 30 }, { open: true, where: 'bottom' }, 1000);
    assert.equal(bottom.issues.length, 1);
    assert.equal(bottom.floatWidthPx, undefined);
    assert.equal(planPanelLayout({ panel: 'lens', width_pct: 30, side: 'bottom' }, { open: true, where: 'right' }, 1000).issues.length, 1, 'pripnutý dole má celú šírku');
  });
});
