/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { focusViewStep } from './viewCommands.js';

const KNOWN = new Set(['ASR:10', 'ASR:20', 'VZT:7']);

describe('pohľad pred FOCUS (AIM #97, V1)', () => {
  it('v 3D sa nič nemení', () => {
    assert.deepEqual(focusViewStep('3d', ['ASR:20'], null, KNOWN), { kind: 'keep' });
  });

  it('2D a split: ciele na jednom podlaží presunú plán tam, na aktívnom ho nechajú', () => {
    assert.deepEqual(focusViewStep('2d', ['ASR:20'], 'ASR:10', KNOWN), { kind: 'storey', key: 'ASR:20' });
    assert.deepEqual(focusViewStep('split', ['ASR:20', 'ASR:20'], 'ASR:10', KNOWN), { kind: 'storey', key: 'ASR:20' });
    assert.deepEqual(focusViewStep('2d', ['ASR:10'], 'ASR:10', KNOWN), { kind: 'keep' });
  });

  it('viac podlaží, cieľ bez podlažia alebo neznáme podlažie prepnú do 3D', () => {
    assert.deepEqual(focusViewStep('2d', ['ASR:10', 'ASR:20'], 'ASR:10', KNOWN), { kind: '3d' });
    assert.deepEqual(focusViewStep('split', ['ASR:20', null], 'ASR:10', KNOWN), { kind: '3d' });
    assert.deepEqual(focusViewStep('2d', ['VZT:99'], 'ASR:10', KNOWN), { kind: '3d' });
  });

  it('bez cieľov sa pohľad nemení', () => {
    assert.deepEqual(focusViewStep('2d', [], 'ASR:10', KNOWN), { kind: 'keep' });
  });
});
