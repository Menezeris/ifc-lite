/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The AIM rail group (D-104 in the AIM repo): first of all groups, holding the
 * three AIM panels in this order, so a fresh layout opens them at the top of
 * the right rail above upstream's groups.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_GROUPS, WORKSPACE_PANELS } from '@/lib/panels/registry';
import { DEFAULT_SIDEBAR_ORDER } from '@/lib/panels/layout-migration';

describe('AIM rail group (D-104)', () => {
  it('leads the groups and holds documents, AIM layers and drawing underlays', () => {
    assert.equal(PANEL_GROUPS[0].id, 'aim');
    assert.deepEqual(
      WORKSPACE_PANELS.filter((p) => p.group === 'aim').map((p) => p.id),
      ['documents', 'aim-layers', 'drawing-underlay'],
    );
  });

  it('puts the AIM panels at the top of a fresh rail, Hierarchy right after them', () => {
    assert.deepEqual(DEFAULT_SIDEBAR_ORDER.slice(0, 4), ['documents', 'aim-layers', 'drawing-underlay', 'hierarchy']);
  });
});
