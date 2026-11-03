/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { autoMarginM, boxAround, sectionBoxForSpace, type FitBox, type FitCandidate } from './sectionBoxFit.js';

const b = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): FitBox =>
  ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

describe('autoMarginM (20 %, 0,3 až 2 m)', () => {
  it('malý prvok dostane minimum, izba 20 %, veľká budova strop', () => {
    assert.equal(autoMarginM(b(0, 0, 0, 0.5, 1, 0.5)), 0.3);
    assert.ok(Math.abs(autoMarginM(b(0, 0, 0, 5, 2.7, 4)) - 1) < 1e-9);
    assert.equal(autoMarginM(b(0, 0, 0, 60, 10, 30)), 2);
  });
  it('nekonečno dá 0, boxAround ho odmietne', () => {
    assert.equal(autoMarginM(b(0, 0, 0, Infinity, 1, 1)), 0);
    assert.equal(boxAround(b(0, 0, 0, Infinity, 1, 1)), null);
  });
  it('boxAround pridá okraj na každú stranu', () => {
    assert.deepEqual(boxAround(b(0, 0, 0, 5, 3, 4), 0.5), b(-0.5, -0.5, -0.5, 5.5, 3.5, 4.5));
  });
});

describe('sectionBoxForSpace', () => {
  // Miestnosť 4 x 2,7 x 3 m od y=0; doska pod: -0,25..0; strop 2,7..2,95; steny hrubé 0,2.
  const space = b(0, 0, 0, 4, 2.7, 3);
  const floor: FitCandidate = { kind: 'slab', ...b(-0.2, -0.25, -0.2, 4.2, 0, 3.2) };
  const ceiling: FitCandidate = { kind: 'slab', ...b(-0.2, 2.7, -0.2, 4.2, 2.95, 3.2) };
  const wallLeft: FitCandidate = { kind: 'wall', ...b(-0.2, 0, -0.2, 0, 2.7, 3.2) };
  const wallRight: FitCandidate = { kind: 'wall', ...b(4, 0, -0.2, 4.2, 2.7, 3.2) };
  const wallBack: FitCandidate = { kind: 'wall', ...b(-0.2, 0, -0.2, 4.2, 2.7, 0) };
  const wallFront: FitCandidate = { kind: 'wall', ...b(-0.2, 0, 3, 4.2, 2.7, 3.2) };

  it('zvisle spodok podlahy až vrch stropu, vodorovne obálka + hrúbka stien', () => {
    const r = sectionBoxForSpace(space, [floor, ceiling, wallLeft, wallRight, wallBack, wallFront]);
    assert.ok(r);
    assert.deepEqual(r.box, b(-0.2, -0.25, -0.2, 4.2, 2.95, 3.2));
    assert.ok(Object.values(r.found).every(Boolean));
  });

  it('bez dát padne na obálku s okrajom (20 % z najdlhšej strany)', () => {
    const r = sectionBoxForSpace(space, []);
    assert.ok(r);
    assert.deepEqual(r.box, b(-0.8, -0.8, -0.8, 4.8, 3.5, 3.8));
    assert.ok(Object.values(r.found).every((f) => !f));
  });

  it('chýbajúca strana dostane okraj, nájdené strany presnú hrúbku', () => {
    const r = sectionBoxForSpace(space, [floor, wallLeft]);
    assert.ok(r);
    assert.equal(r.box.min.y, -0.25);
    assert.equal(r.box.min.x, -0.2);
    assert.equal(r.box.max.y, 2.7 + 0.8);
    assert.equal(r.box.max.x, 4.8);
  });

  it('dlhá stena cez viac miestností nerozšíri box po dĺžke, len o hrúbku', () => {
    const long: FitCandidate = { kind: 'wall', ...b(-0.2, 0, -0.2, 40, 2.7, 0) };
    const r = sectionBoxForSpace(space, [long]);
    assert.ok(r);
    assert.equal(r.box.min.z, -0.2);
    assert.equal(r.box.max.x, 4.8);
  });

  it('dlhá stena tenká v X rozšíri box o hrúbku, nie o svoju dĺžku v Z', () => {
    const long: FitCandidate = { kind: 'wall', ...b(-0.2, 0, -20, 0, 2.7, 20) };
    const r = sectionBoxForSpace(space, [long]);
    assert.ok(r);
    assert.equal(r.box.min.x, -0.2);
    assert.equal(r.box.min.z, -0.8, 'z z okraja (20 % zo 4 m), nie -20 zo steny');
    assert.equal(r.box.max.z, 3.8);
  });

  it('hrubý masív (nad 0,8 m) a doska bez prekrytia pôdorysu sa ignorujú', () => {
    const slabBlock: FitCandidate = { kind: 'wall', ...b(-1.2, 0, -0.2, 0, 2.7, 3.2) };
    const farSlab: FitCandidate = { kind: 'slab', ...b(10, -0.25, 10, 14, 0, 14) };
    const r = sectionBoxForSpace(space, [slabBlock, farSlab]);
    assert.ok(r);
    assert.ok(!r.found.minX && !r.found.minY);
  });

  it('doska hlboko pod miestnosťou (iné podlažie) nie je jej podlaha', () => {
    const lower: FitCandidate = { kind: 'slab', ...b(-0.2, -3.25, -0.2, 4.2, -3, 3.2) };
    const r = sectionBoxForSpace(space, [lower]);
    assert.ok(r && !r.found.minY);
  });
});
