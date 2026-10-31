/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  boxOverlapsPolygon,
  countByClass,
  entitiesUnderRegion,
  mergeGuids,
  preselected,
  regionToIfcPolygon,
  storeyBand,
  type EntityBox,
  type EntityPlacement,
} from './docEntities.js';

// Strana 1000 x 500 bodov, 1 bod = 0,1 m, počiatok strany v IFC (10, 20): x' = 10 + 0,1 x, y' = 20 + 0,1 y.
const placement: EntityPlacement = { affine: [0.1, 0, 10, 0, 0.1, 20], pageSize: [1000, 500], storeyZ: 3 };

const box = (guid: string, ifcType: string, x: number, y: number, z0 = 3, z1 = 5, size = 1): EntityBox => ({
  guid, ifcType, name: guid, min: { x, y, z: z0 }, max: { x: x + size, y: y + size, z: z1 },
});

describe('regionToIfcPolygon', () => {
  it('prevedie zlomky vľavo hore na IFC cez affine (y strany hore)', () => {
    const poly = regionToIfcPolygon(placement, { x: 0.1, y: 0.2, w: 0.2, h: 0.4 })!;
    // x 100..300 b -> 20..40 m; zlomok y 0,2..0,6 zhora = bod y 400..200 -> 60..40 m... + 20
    assert.deepEqual(poly[0], { x: 20, y: 60 });
    assert.ok(Math.abs(poly[2].x - 40) < 1e-6);
    assert.ok(Math.abs(poly[2].y - 40) < 1e-6);
  });

  it('bez oblasti vezme celú stranu', () => {
    const poly = regionToIfcPolygon(placement, null)!;
    const xs = poly.map((p) => p.x);
    assert.ok(Math.abs(Math.min(...xs) - 10) < 1e-6);
    assert.ok(Math.abs(Math.max(...xs) - 110) < 1e-6);
  });

  it('zvislý rez a neplatná strana návrh nedajú', () => {
    assert.equal(regionToIfcPolygon({ ...placement, plane: {} }, null), null);
    assert.equal(regionToIfcPolygon({ ...placement, pageSize: [0, 500] }, null), null);
  });
});

describe('boxOverlapsPolygon', () => {
  // Otočený štvorec (kosoštvorec) so stredom (0,0) a polomerom 2.
  const diamond = [{ x: 0, y: -2 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }];

  it('obálka v rohu obálky kosoštvorca, ale mimo neho, sa nepočíta', () => {
    assert.equal(boxOverlapsPolygon(box('a', 'IfcWall', 1.4, 1.4, 0, 1, 0.5), diamond), false);
  });

  it('obálka pretínajúca kosoštvorec sa počíta', () => {
    assert.equal(boxOverlapsPolygon(box('a', 'IfcWall', 0.5, 0.5, 0, 1, 0.5), diamond), true);
  });
});

describe('entitiesUnderRegion', () => {
  const poly = regionToIfcPolygon(placement, { x: 0.1, y: 0.2, w: 0.2, h: 0.4 })!;
  const band = storeyBand(3, [0, 3, 7]);

  it('pásmo podlažia je po ďalšie podlažie, inak štandardná výška', () => {
    assert.deepEqual(band, [3, 7]);
    assert.deepEqual(storeyBand(3, [3]), [3, 7]);
  });

  it('vráti len prvky v oblasti a v pásme, bez priestorov a otvorov', () => {
    const boxes = [
      box('in', 'IfcWall', 30, 45),
      box('space', 'IfcSpace', 30, 45),
      box('opening', 'IfcOpeningElement', 30, 45),
      box('far', 'IfcWall', 80, 45),
      box('slabBelow', 'IfcSlab', 30, 45, 2.7, 3.05),
      box('slabAbove', 'IfcSlab', 30, 45, 6.95, 7.2),
      box('column', 'IfcColumn', 25, 42, 3, 6),
    ];
    const { candidates, total } = entitiesUnderRegion(boxes, poly, band);
    assert.deepEqual(candidates.map((c) => c.guid).sort(), ['column', 'in']);
    assert.equal(total, 2);
  });

  it('zoradí podľa vzdialenosti od stredu a vynechá duplicitné GlobalId', () => {
    const { candidates } = entitiesUnderRegion(
      [box('b', 'IfcWall', 38, 48), box('a', 'IfcWall', 30, 45), box('a', 'IfcWall', 30, 45)],
      poly,
      band,
    );
    assert.deepEqual(candidates.map((c) => c.guid), ['a', 'b']);
  });

  it('strop zoznamu zachová celkový počet', () => {
    const boxes = Array.from({ length: 250 }, (_, i) => box(`g${i}`, 'IfcWall', 30, 45, 3, 5, 0.1));
    const out = entitiesUnderRegion(boxes, poly, band);
    assert.equal(out.candidates.length, 200);
    assert.equal(out.total, 250);
  });
});

describe('výber', () => {
  it('označí všetko len pri malom počte', () => {
    const few = Array.from({ length: 25 }, (_, i) => ({ guid: `g${i}`, ifcType: 'IfcWall', name: '', distance: i }));
    assert.equal(preselected(few).size, 25);
    assert.equal(preselected([...few, { guid: 'x', ifcType: 'IfcWall', name: '', distance: 99 }]).size, 0);
  });

  it('počty podľa triedy zostupne', () => {
    const l = [
      { guid: '1', ifcType: 'IfcWall', name: '', distance: 0 },
      { guid: '2', ifcType: 'IfcDoor', name: '', distance: 0 },
      { guid: '3', ifcType: 'IfcDoor', name: '', distance: 0 },
    ];
    assert.deepEqual(countByClass(l), [{ ifcType: 'IfcDoor', count: 2 }, { ifcType: 'IfcWall', count: 1 }]);
  });

  it('zjednotenie guidov bez duplicít a so stropom', () => {
    assert.deepEqual(mergeGuids(['a', 'b'], ['b', 'c', ''], 10), ['a', 'b', 'c']);
    assert.deepEqual(mergeGuids(['a', 'b'], ['c'], 2), ['a', 'b']);
  });
});
