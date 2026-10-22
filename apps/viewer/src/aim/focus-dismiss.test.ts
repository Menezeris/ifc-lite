/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isClickGesture, isDismissKey, isSceneTarget } from './focus-dismiss.js';

describe('zrušenie zvýraznenia FOCUS v UI (AIM #94)', () => {
  it('klik bez ťahania je gesto, ťah kamerou nie', () => {
    assert.equal(isClickGesture({ x: 10, y: 10 }, { x: 10, y: 10 }), true);
    assert.equal(isClickGesture({ x: 10, y: 10 }, { x: 13, y: 12 }), true);
    assert.equal(isClickGesture({ x: 10, y: 10 }, { x: 40, y: 10 }), false);
  });

  it('Esc ruší zvýraznenie, ale nie v textovom poli a nie iná klávesa', () => {
    assert.equal(isDismissKey('Escape', false), true);
    assert.equal(isDismissKey('Escape', true), false);
    assert.equal(isDismissKey('a', false), false);
  });

  it('klik sa berie len na plátne scény', () => {
    assert.equal(isSceneTarget('canvas'), true);
    assert.equal(isSceneTarget('DIV'), false);
    assert.equal(isSceneTarget(undefined), false);
  });
});
