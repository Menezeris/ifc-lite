/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sceneMode, settle3d } from './sceneMode.js';

describe('režim canvasu podľa záložky (AIM #216)', () => {
  it('záložka 3D nikdy nie je 2D: zvyšný zámok sa berie ako 3D, split ostáva', () => {
    assert.equal(sceneMode('3d', '2d'), '3d');
    assert.equal(sceneMode('3d', '3d'), '3d');
    assert.equal(sceneMode('3d', 'split'), 'split');
  });

  it('pôdorys a uložený pohľad si nechajú odvodený režim', () => {
    assert.equal(sceneMode('plan', '2d'), '2d');
    assert.equal(sceneMode('plan', 'split'), 'split');
    assert.equal(sceneMode('view', '2d'), '2d');
    assert.equal(sceneMode(undefined, '2d'), '2d');
  });

  it('settle3d: zámok, split alebo ortografická kamera sa po mode=3d zrušia', () => {
    assert.deepEqual(settle3d({ viewLocked: true, splitView: false, projection: 'orthographic' }), { leaveLocked: true, perspective: true });
    assert.deepEqual(settle3d({ viewLocked: false, splitView: true, projection: 'perspective' }), { leaveLocked: true, perspective: false });
    assert.deepEqual(settle3d({ viewLocked: false, splitView: false, projection: 'orthographic' }), { leaveLocked: false, perspective: true });
  });

  it('settle3d: čistá perspektívna 3D sa nemení', () => {
    assert.deepEqual(settle3d({ viewLocked: false, splitView: false, projection: 'perspective' }), { leaveLocked: false, perspective: false });
  });
});
