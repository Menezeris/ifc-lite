/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { spaceFootprint, type Footprint } from './aimRoomFill.js';
import { FILL_ALPHA, LIFT, fillsRoom, floorLevel, footprintRings, hexRgba, roomFills, type Box3 } from './aimRoomFill3d.js';
import { VOLUME_SUFFIX, paintedColors } from './aimLensPaint.js';
import { AIM_LENS_NAME, VOLUME_SUFFIX as PLAN_SUFFIX } from './aimLensPlan.js';

/** Spodná plocha obdĺžnika (x, z) vo výške y ako dva trojuholníky. */
function rect(x0: number, z0: number, w: number, d: number, y = 1): Footprint['triangles'] {
  const [a, b, c, e] = [[x0, z0], [x0 + w, z0], [x0 + w, z0 + d], [x0, z0 + d]].map(([x, z]) => ({ x, y, z }));
  return [a, b, c, a, c, e];
}
const fp = (triangles: Footprint['triangles'], y = 1): Footprint => ({ triangles, anchor: { x: 2, y, z: 1.5 }, top: y + 2.5 });
const box = (minX: number, minZ: number, maxX: number, maxZ: number, minY: number, maxY: number): Box3 => ({ minX, minY, minZ, maxX, maxY, maxZ });

describe('podstava miestnosti v 3D (AIM D-125 doplnok, #175)', () => {
  const room = fp(rect(0, 0, 4, 3));

  it('výška = vrch podlahovej krytiny nad pôdorysom + LIFT, inak spodok miestnosti', () => {
    assert.equal(floorLevel(room, []), 1 + LIFT);
    const floor = box(0, 0, 4, 3, 1, 1.08);
    assert.ok(Math.abs(floorLevel(room, [floor]) - (1.08 + LIFT)) < 1e-9);
  });

  it('podhľad, krytina iného podlažia a susednej miestnosti výšku nemenia', () => {
    const ceiling = box(0, 0, 4, 3, 3.4, 3.42);
    const below = box(0, 0, 4, 3, -2, -1.9);
    const neighbour = box(4, 0, 8, 3, 1, 1.2);
    const touching = box(3.99, 0, 8, 3, 1, 1.2);
    assert.equal(floorLevel(room, [ceiling, below, neighbour, touching]), 1 + LIFT);
    // Najvyššia z prekrývajúcich krytín (napr. dlažba a koberec).
    assert.ok(Math.abs(floorLevel(room, [box(0, 0, 2, 3, 1, 1.05), box(1, 0, 4, 3, 1, 1.1)]) - (1.1 + LIFT)) < 1e-9);
  });

  it('pri vodorovnom reze len podstava pod rezom', () => {
    assert.equal(fillsRoom(1.1, null), true);
    assert.equal(fillsRoom(1.1, 2.2), true);
    assert.equal(fillsRoom(1.1, 0.5), false);
  });

  it('farba Lens s alfou pôdorysu; zlá farba nič', () => {
    assert.deepEqual(hexRgba('#ff8000', 0.45), [1, 128 / 255, 0, 0.45]);
    assert.equal(hexRgba('red', 1), null);
    assert.deepEqual(roomFills(room, 1.1, 'nope'), []);
  });

  it('jeden polygón na miestnosť, body lokálne k ťažisku, výška v origin', () => {
    const [fill, ...rest] = roomFills(room, 1.1, '#22c55e');
    assert.equal(rest.length, 0);
    assert.deepEqual(fill.origin, [2, 1.1, 1.5]);
    assert.equal(fill.worldY, 0);
    assert.equal(fill.color[3], FILL_ALPHA);
    assert.equal(fill.definesExtent, false);
    assert.equal(fill.points.length, 8, 'obdĺžnik = 4 vrcholy obrysu, bez uhlopriečky');
    assert.equal(fill.holesOffsets.length, 0);
    const xs = [0, 2, 4, 6].map((i) => fill.points[i] + 2);
    assert.deepEqual([Math.min(...xs), Math.max(...xs)], [0, 4]);
  });

  it('diera (šachta) v miestnosti a miestnosť z dvoch oddelených častí', () => {
    // Rámik 6 x 6 okolo diery 2 x 2: štyri pásy.
    const frame = [...rect(0, 0, 6, 2), ...rect(0, 4, 6, 2), ...rect(0, 2, 2, 2), ...rect(4, 2, 2, 2)];
    const rings = footprintRings(frame);
    assert.ok(rings);
    assert.equal(rings.length, 1, 'T-spoje pásov (vrchol na hrane suseda) sa rozdelia');
    assert.equal(rings[0].holes.length, 1);
    const fill = roomFills(fp(frame), 1, '#000000')[0];
    assert.equal(fill.holesOffsets.length, 1);
    assert.equal(footprintRings([...rect(0, 0, 2, 2), ...rect(5, 5, 2, 2)])?.length, 2);
  });

  it('obrys sa nedá uzavrieť (sused s opačným otočením trojuholníkov): výplň po trojuholníkoch', () => {
    const tris = [...rect(0, 0, 2, 2), ...rect(2, 0, 2, 2).reverse()];
    assert.equal(footprintRings(tris), null);
    const fills = roomFills(fp(tris), 1, '#000000');
    assert.equal(fills.length, 4);
    assert.ok(fills.every((f) => f.points.length === 6));
  });

  it('podstava z geometrie miestnosti: spodná plocha kvádra', () => {
    const positions = new Float32Array([0, 1, 0, 4, 1, 0, 4, 1, 3, 0, 1, 3, 0, 3.5, 0, 4, 3.5, 0, 4, 3.5, 3, 0, 3.5, 3]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    const space = spaceFootprint([{ positions, indices }]);
    assert.ok(space);
    assert.equal(roomFills(space, floorLevel(space, []), '#3b82f6').length, 1);
  });
});

describe('farby AIM chat lens do renderera (#175)', () => {
  const colors = new Map([[1, 'a'], [2, 'b'], [3, 'c']]);
  const rules = [{ id: `aim-t-0${VOLUME_SUFFIX}` }, { id: 'aim-t-0' }];
  const ids = new Map([[`aim-t-0${VOLUME_SUFFIX}`, [1, 2]], ['aim-t-0', [3]]]);

  it('miestnosti a zóny z varianty ~vol vynechá, ostatné prvky nechá', () => {
    const out = paintedColors(colors, { name: AIM_LENS_NAME, rules }, ids);
    assert.deepEqual([...out.keys()], [3]);
    assert.equal(colors.size, 3, 'vstup sa nemení (lensColorMap a súhrn ho potrebujú celý)');
  });

  it('cudzia lens a lens bez miestností: tá istá mapa', () => {
    assert.equal(paintedColors(colors, { name: 'Color by Material', rules }, ids), colors);
    assert.equal(paintedColors(colors, { name: AIM_LENS_NAME, rules: [{ id: 'aim-t-0' }] }, ids), colors);
    assert.equal(paintedColors(colors, null, ids), colors);
  });

  it('prípona varianty je v pláne aj v malom module rovnaká', () => {
    assert.equal(PLAN_SUFFIX, VOLUME_SUFFIX);
  });
});
