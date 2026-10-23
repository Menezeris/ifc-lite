/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { sideDockedPanels, type SideDockInput } from './aimSideDock.js';
import { panelInfo, type PanelsStateLike } from './aimPanelsPlan.js';

const base: SideDockInput = {
  sidebarMode: 'expanded',
  sidebarActivePanel: 'lens',
  sidebarSecondaryPanel: null,
  detached: new Set(),
};

describe('bočný stĺpec: čo je naozaj vidno (AIM #212)', () => {
  it('rozbalený stĺpec: aktívny panel je primárny, split je sekundárny', () => {
    assert.deepEqual(sideDockedPanels(base), { primary: 'lens', secondary: null });
    assert.deepEqual(sideDockedPanels({ ...base, sidebarSecondaryPanel: 'documents' }), { primary: 'lens', secondary: 'documents' });
    assert.deepEqual(sideDockedPanels({ ...base, sidebarSecondaryPanel: 'lens' }), { primary: 'lens', secondary: null });
  });

  it('zbalený stĺpec nezobrazuje nič (ikona vlastností po zatvorení cez SET_PANELS nesvieti)', () => {
    const collapsed = { ...base, sidebarMode: 'collapsed', sidebarActivePanel: 'properties', sidebarSecondaryPanel: 'documents' };
    assert.deepEqual(sideDockedPanels(collapsed), { primary: null, secondary: null });
  });

  it('odpojený aktívny panel: stĺpec padne späť na vlastnosti, a ak sú odpojené aj tie, na nič', () => {
    assert.deepEqual(sideDockedPanels({ ...base, detached: new Set(['lens']) }), { primary: 'properties', secondary: null });
    assert.deepEqual(sideDockedPanels({ ...base, detached: new Set(['lens', 'properties']) }), { primary: null, secondary: null });
    assert.deepEqual(sideDockedPanels({ ...base, sidebarSecondaryPanel: 'documents', detached: new Set(['documents']) }), { primary: 'lens', secondary: null });
  });

  it('panelInfo číta ten istý zdroj: padnutie na vlastnosti je vidieť aj v hlásenom stave', () => {
    const s: PanelsStateLike = {
      leftPanelCollapsed: false,
      sidebarMode: 'expanded',
      sidebarActivePanel: 'lens',
      sidebarSecondaryPanel: null,
      sidebarWidthPct: 22,
      floatingPanels: [{ id: 'lens', snap: 'right', w: 300, h: 300 }],
      poppedOutIds: [],
      listPanelVisible: false,
      drawing2DPanelVisible: false,
    };
    assert.deepEqual(panelInfo(s, 'properties'), { open: true, where: 'right' });
    assert.deepEqual(panelInfo({ ...s, sidebarMode: 'collapsed' }, 'properties'), { open: false });
  });
});
