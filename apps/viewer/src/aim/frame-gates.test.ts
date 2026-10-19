/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { gatesToReveal } from './frame-gates.js';

describe('frame-gates (AIM D-102)', () => {
  it('zapne len skryté triedy cieľa: miestnosť a zónu', () => {
    const off = { spaces: false, spatialZones: false };
    assert.deepEqual(gatesToReveal(['IfcSpace'], off), ['spaces']);
    assert.deepEqual(gatesToReveal(['IFCSPACE', 'IfcSpatialZone', 'IfcSpace'], off), ['spaces', 'spatialZones']);
    assert.deepEqual(gatesToReveal(['IfcWall', 'IfcDoor'], off), []);
    assert.deepEqual(gatesToReveal(['IfcSpace'], { spaces: true, spatialZones: false }), []);
  });
});
