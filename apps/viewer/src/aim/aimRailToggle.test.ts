/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { propertiesClickCollapses } from './aimRailToggle.js';
import type { SideDockInput } from './aimSideDock.js';

const base: SideDockInput = {
  sidebarMode: 'expanded',
  sidebarActivePanel: 'properties',
  sidebarSecondaryPanel: null,
  detached: new Set(),
};

describe('ikona vlastností ako prepínač (AIM #243)', () => {
  it('otvorené vlastnosti: klik zbalí stĺpec', () => {
    assert.equal(propertiesClickCollapses('properties', base), true);
  });

  it('iný panel v stĺpci, zbalený stĺpec alebo odpojené vlastnosti: klik nezbaľuje', () => {
    assert.equal(propertiesClickCollapses('properties', { ...base, sidebarActivePanel: 'lens' }), false);
    assert.equal(propertiesClickCollapses('properties', { ...base, sidebarMode: 'collapsed' }), false);
    assert.equal(propertiesClickCollapses('properties', { ...base, detached: new Set(['properties']) }), false);
  });

  it('ostatné ikony sa nemenia', () => {
    assert.equal(propertiesClickCollapses('lens', { ...base, sidebarActivePanel: 'lens' }), false);
  });
});
