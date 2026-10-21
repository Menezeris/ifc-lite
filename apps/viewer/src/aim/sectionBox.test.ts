/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isSectionBoxMessage, orderedBox, toSectionBox } from './sectionBox.js';

const S = 'aim-bridge' as const;
const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 2, z: 3 } };

describe('rezný box z chatu (AIM D-132)', () => {
  it('SET_SECTION_BOX: práve jeden cieľ, prvky s okrajom alebo obálka s kladným rozmerom', () => {
    assert.ok(isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX', guids: ['G1'], marginM: 0.5 }));
    assert.ok(isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX', box }));
    assert.ok(!isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX', guids: ['G1'], box }));
    assert.ok(!isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX' }));
    assert.ok(!isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX', guids: [] }));
    assert.ok(!isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX', box, marginM: 1 }));
    assert.ok(!isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX', guids: ['G1'], marginM: 21 }));
    assert.ok(!isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX', box: { min: box.max, max: box.min } }));
    assert.ok(!isSectionBoxMessage({ source: S, type: 'SET_SECTION_BOX', guids: Array.from({ length: 101 }, (_, i) => `G${i}`) }));
  });

  it('box s okrajom do tvaru upstreamu a rohy po prevode osí znova zoradené', () => {
    assert.deepStrictEqual(toSectionBox(box, 0.5), { min: [-0.5, -0.5, -0.5], max: [1.5, 2.5, 3.5] });
    assert.deepStrictEqual(orderedBox({ x: 1, y: 0, z: -3 }, { x: 0, y: 2, z: -1 }), { min: { x: 0, y: 0, z: -3 }, max: { x: 1, y: 2, z: -1 } });
  });
});
