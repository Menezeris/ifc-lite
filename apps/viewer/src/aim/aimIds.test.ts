/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stopIds } from './aimIds.js';
import { useAimIds } from './aimIdsStore.js';

describe('odpojenie mosta počas ukladania IDS (D-162)', () => {
  it('rozpracované uloženie sa zruší, aby tlačidlo nezostalo vypnuté', () => {
    useAimIds.setState({ status: { target: 'studio', kind: 'saving' } });
    stopIds();
    assert.equal(useAimIds.getState().status, null);
  });

  it('hotový výsledok uloženia ostáva viditeľný', () => {
    useAimIds.setState({ status: { target: 'studio', kind: 'saved', code: 'A', version: 2 } });
    stopIds();
    assert.equal(useAimIds.getState().status?.kind, 'saved');
  });
});
