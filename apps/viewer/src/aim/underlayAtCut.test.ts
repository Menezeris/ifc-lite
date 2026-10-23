/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { horizontalCutZ, storeyZToDraw, underlayAtLevel } from './underlayAtCut.js';

const LEVELS = [0, 3.2, 6.4];

describe('PDF podklad pod vodorovným rezom (AIM D-161)', () => {
  it('rez 1,2 m nad 1NP: len podklad 1NP, vyššie podlažia sa nekreslia', () => {
    const draw = storeyZToDraw(LEVELS, 1.2, false);
    assert.equal(draw, 0);
    assert.equal(underlayAtLevel(0, draw), true);
    assert.equal(underlayAtLevel(3.2, draw), false);
    assert.equal(underlayAtLevel(6.4, draw), false);
  });

  it('rez 1,2 m nad 2NP: podklad 2NP, nie 1NP pod ním ani 3NP nad ním', () => {
    assert.equal(storeyZToDraw(LEVELS, 4.4, false), 3.2);
  });

  it('rez presne na úrovni podlažia patrí tomuto podlažiu', () => {
    assert.equal(storeyZToDraw(LEVELS, 3.2, false), 3.2);
    assert.equal(storeyZToDraw(LEVELS, 3.195, false), 3.2);
  });

  it('otočený rez (pohľad zdola) kreslí najbližšie podlažie nad rezom', () => {
    assert.equal(storeyZToDraw(LEVELS, 1.2, true), 3.2);
    assert.equal(storeyZToDraw(LEVELS, 6.9, true), null);
  });

  it('bez rezu, bez podkladov alebo s rezom pod všetkými podlažiami sa nefiltruje nič', () => {
    assert.equal(storeyZToDraw(LEVELS, null, false), null);
    assert.equal(storeyZToDraw([], 1.2, false), null);
    assert.equal(storeyZToDraw(LEVELS, -1, false), null);
    assert.equal(underlayAtLevel(6.4, null), true);
  });

  it('podklady jedného podlažia (rovnaká výška) sa kreslia všetky', () => {
    const draw = storeyZToDraw([0, 0, 3.2], 1.2, false);
    assert.equal(underlayAtLevel(0, draw), true);
    assert.equal(underlayAtLevel(0.002, draw), true);
  });

  it('výška rezu: len vodorovná rovina bez boxu, posun rámca sa pripočíta', () => {
    const bounds = { min: { x: 0, y: -2, z: 0 }, max: { x: 10, y: 8, z: 10 } };
    assert.equal(horizontalCutZ({ axis: 'down', position: 50 }, bounds, 1), 4);
    assert.equal(horizontalCutZ({ axis: 'front', position: 50 }, bounds, 1), null);
    assert.equal(horizontalCutZ({ axis: 'down', position: 50, box: {} }, bounds, 1), null);
    assert.equal(horizontalCutZ({ axis: 'down', position: 50 }, null, 1), null);
    assert.equal(horizontalCutZ(null, bounds, 1), null);
  });
});
