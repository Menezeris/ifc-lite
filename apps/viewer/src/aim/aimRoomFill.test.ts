/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { footprintOutline, footprintPath, spaceFootprint } from './aimRoomFill.js';

/** Kváder 4 x 3 m (x, z), výška 2,5 m (y) od y = 1: 8 vrcholov, 12 trojuholníkov. */
function box(x0: number, z0: number, w: number, d: number, y0 = 1, h = 2.5) {
  const positions: number[] = [];
  for (const y of [y0, y0 + h]) for (const [x, z] of [[x0, z0], [x0 + w, z0], [x0 + w, z0 + d], [x0, z0 + d]]) positions.push(x, y, z);
  const indices = [
    0, 1, 2, 0, 2, 3, // spodok
    4, 6, 5, 4, 7, 6, // vrch
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, // steny
  ];
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

describe('aimRoomFill (AIM D-119)', () => {
  it('pôdorys = len spodná plocha a ťažisko v strede', () => {
    const fp = spaceFootprint([box(10, 20, 4, 3)]);
    assert.ok(fp);
    assert.equal(fp.triangles.length, 6, 'dva trojuholníky spodnej plochy');
    assert.ok(fp.triangles.every((p) => p.y === 1));
    assert.deepEqual(fp.anchor, { x: 12, y: 1, z: 21.5 });
  });

  it('L-tvar z dvoch častí: ťažisko vážené plochou', () => {
    const fp = spaceFootprint([box(0, 0, 4, 2), box(0, 2, 2, 2)]);
    assert.ok(fp);
    assert.equal(fp.triangles.length, 12);
    // plochy 8 a 4: x = (8*2 + 4*1) / 12, z = (8*1 + 4*3) / 12
    assert.ok(Math.abs(fp.anchor.x - 20 / 12) < 1e-9);
    assert.ok(Math.abs(fp.anchor.z - 20 / 12) < 1e-9);
  });

  it('lokálny rámec prvku: k vrcholom pripočíta origin', () => {
    const fp = spaceFootprint([{ ...box(0, 0, 4, 3, 0), origin: [100, 2, -50] }]);
    assert.ok(fp);
    assert.deepEqual(fp.anchor, { x: 102, y: 2, z: -48.5 });
  });

  it('bez geometrie null', () => {
    assert.equal(spaceFootprint([]), null);
    assert.equal(spaceFootprint([{ positions: new Float32Array(), indices: new Uint32Array() }]), null);
  });

  it('cesta: rovnaké otočenie trojuholníkov a vynechaný trojuholník mimo obrazovky', () => {
    const project = (p: { x: number; z: number }) => ({ x: p.x, y: p.z });
    const cw = footprintPath([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }], project);
    const ccw = footprintPath([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], project);
    assert.equal(cw, ccw);
    assert.equal(cw, 'M0.0 0.0L1.0 0.0L0.0 1.0Z');
    const behind = footprintPath([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], () => null);
    assert.equal(behind, '');
  });

  it('obrys: štyri hrany obdĺžnika bez vnútornej uhlopriečky', () => {
    const fp = spaceFootprint([box(0, 0, 4, 3, 0)]);
    assert.ok(fp);
    const d = footprintOutline(fp.triangles, (p) => ({ x: p.x, y: p.z }));
    assert.equal(d.split('M').length - 1, 4);
    assert.ok(!d.includes('M0.0 0.0L4.0 3.0') && !d.includes('M4.0 3.0L0.0 0.0'), 'uhlopriečka nie je v obryse');
  });
});
