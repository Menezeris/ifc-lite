/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { WORKSPACE_PANELS } from '@/lib/panels/registry';
import { PANEL_KEYS, isPanelKey, panelCatalog, panelIdOf, shortcutOf, wireName } from './aimPanelList.js';
import { describePanels, type PanelsStore } from './aimPanelsPlan.js';
import { isPanelsRequest } from './view-protocol.js';

const quiet: PanelsStore = {
  leftPanelCollapsed: true,
  sidebarMode: 'expanded',
  sidebarActivePanel: 'properties',
  sidebarSecondaryPanel: null,
  sidebarWidthPct: 22,
  floatingPanels: [],
  poppedOutIds: [],
  listPanelVisible: false,
};

describe('zoznam panelov z chatu je odvodený z registra (AIM D-150, #179)', () => {
  it('každý panel registra má meno na drôte, ktoré sa vráti na jeho id (nič nechýba, nič sa nezdvojí)', () => {
    assert.equal(PANEL_KEYS.length, WORKSPACE_PANELS.length);
    assert.equal(new Set(PANEL_KEYS).size, PANEL_KEYS.length, 'mená sú jedinečné');
    for (const p of WORKSPACE_PANELS) {
      assert.ok(isPanelKey(wireName(p.id)), `panel ${p.id} chýba v zozname pre chat`);
      assert.equal(panelIdOf(wireName(p.id)), p.id);
    }
  });

  it('historické mená z D-127 platia ďalej, ostatné sú id registra (BCF topics = bcf)', () => {
    assert.equal(wireName('drawing-underlay'), 'underlays');
    assert.equal(wireName('hierarchy'), 'model_tree');
    for (const legacy of ['lens', 'properties', 'underlays', 'documents', 'lists', 'model_tree']) assert.ok(isPanelKey(legacy), legacy);
    assert.ok(isPanelKey('bcf'));
    assert.equal(isPanelKey('legend'), false);
    assert.throws(() => panelIdOf('legend'));
  });

  it('klávesové skratky Alt+N podľa poradia registra, rovnako ako rail: Alt+3 je BCF', () => {
    assert.equal(shortcutOf('properties'), 'Alt+1');
    assert.equal(shortcutOf('bcf'), 'Alt+3');
    assert.equal(shortcutOf(WORKSPACE_PANELS[9].id), 'Alt+0');
    assert.equal(shortcutOf(WORKSPACE_PANELS[10].id), undefined);
    assert.equal(panelCatalog().filter((r) => r.shortcut).length, 10);
  });

  it('view_state nesie všetky panely registra s domovom a skratkou, aj zatvorené', () => {
    const state = describePanels(quiet);
    for (const p of WORKSPACE_PANELS) {
      const info = state[wireName(p.id)];
      assert.ok(info, `panel ${p.id} chýba vo view_state`);
      assert.equal((info as { home?: string }).home, p.region);
    }
    assert.equal(state.bcf.shortcut, 'Alt+3');
    assert.equal(state.bcf.open, false);
    assert.equal(state.properties.open, true);
    assert.equal(state.model_tree.open, false);
  });

  it('SET_PANELS prijme každé meno z registra', () => {
    for (const key of PANEL_KEYS) assert.equal(isPanelsRequest({ [key]: 'toggle' }), true, key);
  });
});
