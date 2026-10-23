/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { statusAfterDisconnect } from './aimIdsStatus.js';

describe('odpojenie mosta počas ukladania IDS (D-162)', () => {
  it('rozpracované uloženie sa zruší, aby tlačidlo nezostalo vypnuté', () => {
    assert.equal(statusAfterDisconnect({ target: 'studio', kind: 'saving' }), null);
  });

  it('hotový výsledok uloženia ostáva viditeľný, bez stavu ostáva bez stavu', () => {
    const saved = { target: 'studio', kind: 'saved', code: 'A', version: 2 };
    assert.equal(statusAfterDisconnect(saved), saved);
    assert.equal(statusAfterDisconnect(null), null);
  });
});
