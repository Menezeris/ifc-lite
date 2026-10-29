/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_MAX_OPACITY, isSpaceClass, spacePredicate, withoutOpaqueSpaces } from './aimSpaceColor.js';
import { FILL_ALPHA } from './aimRoomFill3d.js';

const isSpace = spacePredicate([
  { expressId: 1, ifcType: 'IfcSpace' },
  { expressId: 2, ifcType: 'IfcSpatialZone' },
  { expressId: 3, ifcType: 'IfcWall' },
]);

describe('priestor nikdy plnou farbou (D-173)', () => {
  it('strop krytia je 0,35 a podstava ho neprekračuje', () => {
    assert.equal(SPACE_MAX_OPACITY, 0.35);
    assert.ok(FILL_ALPHA <= SPACE_MAX_OPACITY);
  });

  it('trieda priestoru: IfcSpace a IfcSpatialZone, nie stena', () => {
    assert.ok(isSpaceClass('IfcSpace') && isSpaceClass('IfcSpatialZone'));
    assert.ok(!isSpaceClass('IfcWall') && !isSpaceClass(undefined));
  });

  it('plná farba priestoru vypadne, ostatné triedy ostanú', () => {
    const colors = new Map<number, [number, number, number, number]>([
      [1, [1, 0, 0, 1]], [2, [0, 1, 0, 1]], [3, [0, 0, 1, 1]],
    ]);
    const out = withoutOpaqueSpaces(colors, isSpace);
    assert.deepEqual([...out.keys()], [3]);
    assert.equal(colors.size, 3, 'vstup sa nemení');
  });

  it('duch X-ray (alfa do stropu) na priestore ostane', () => {
    const colors = new Map<number, [number, number, number, number]>([[1, [0.6, 0.6, 0.6, 0.15]]]);
    assert.equal(withoutOpaqueSpaces(colors, isSpace), colors);
  });

  it('bez priestoru vráti ten istý objekt', () => {
    const colors = new Map<number, [number, number, number, number]>([[3, [1, 1, 1, 1]]]);
    assert.equal(withoutOpaqueSpaces(colors, isSpace), colors);
  });
});
