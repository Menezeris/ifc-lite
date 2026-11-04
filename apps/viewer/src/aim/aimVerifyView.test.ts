/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cameraPose, FACE_CLEARANCE_M as C, PLAN_CUT_M, quantityKind, verifyViewPlan, type Box } from './aimVerifyView.js';

/** Miestnosť 20 x 8 m (dlhšia os x), 3,95 m vysoká, render rámec (Y hore). */
const body: Box = { min: { x: 0, y: 4.85, z: 0 }, max: { x: 20, y: 8.8, z: 8 } };
/** Obálka so skladbami: dosky 0,3 m pod a nad, steny 0,2 m. */
const room: Box = { min: { x: -0.2, y: 4.55, z: -0.2 }, max: { x: 20.2, y: 9.1, z: 8.2 } };
/** Doska cez celé podlažie (vstupný prvok). */
const slab: Box = { min: { x: -50, y: 4.5, z: -50 }, max: { x: 50, y: 4.85, z: 50 } };

describe('quantityKind', () => {
  it('rozlíši výšky, plochy, obvod a objemy podľa mena veličiny', () => {
    assert.equal(quantityKind('Qto_SpaceBaseQuantities.Height'), 'height');
    assert.equal(quantityKind('Qto_SpaceBaseQuantities.FinishFloorHeight'), 'height');
    assert.equal(quantityKind('Qto_SpaceBaseQuantities.FinishCeilingHeight'), 'height');
    assert.equal(quantityKind('Qto_SpaceBaseQuantities.NetFloorArea'), 'area');
    assert.equal(quantityKind('Qto_SpaceBaseQuantities.GrossPerimeter'), 'perimeter');
    assert.equal(quantityKind('Qto_SpaceBaseQuantities.NetVolume'), 'volume');
    assert.equal(quantityKind('Qto_X.Count'), 'other');
  });
});

describe('verifyViewPlan', () => {
  it('výška: zvislý rez stredom miestnosti pozdĺž dlhšej strany, kamera vodorovne zboku, perspektíva', () => {
    const p = verifyViewPlan('height', room, body, [slab])!;
    assert.equal(p.projection, 'perspective');
    // rez pozdĺž dlhšej osi x: box sa začína pri strede kratšej osi z (kóta v strede ostane za rovinou)
    assert.ok(Math.abs(p.box.min.z - 3.95) < 1e-9, `rez pri z=${p.box.min.z}`);
    assert.ok(Math.abs(p.box.max.z - (8.2 + C)) < 1e-9);
    assert.ok(Math.abs(p.box.min.x - (-0.2 - C)) < 1e-9 && Math.abs(p.box.max.x - (20.2 + C)) < 1e-9, 'doska cez podlažie nerozšíri box vodorovne');
    assert.ok(Math.abs(p.box.min.y - (4.5 - C)) < 1e-9, 'zvisle sa box rozšíri o vstupnú dosku');
    assert.ok(p.dir.z < -0.9 && p.dir.y > 0 && p.dir.y < 0.3 && p.dir.x === 0, 'kamera na strane rezu, mierne zhora');
  });

  it('výška, možnosť b: ortografia presne vodorovne', () => {
    const p = verifyViewPlan('height', room, body, [], 'b')!;
    assert.equal(p.projection, 'orthographic');
    assert.deepEqual(p.dir, { x: 0, y: 0, z: -1 });
  });

  it('plocha a obvod: pôdorysný rez 1,2 m nad podlahou, kamera zošikma zhora, perspektíva', () => {
    for (const kind of ['area', 'perimeter'] as const) {
      const p = verifyViewPlan(kind, room, body, [])!;
      assert.equal(p.projection, 'perspective');
      assert.ok(p.dir.y > 0.7 && p.dir.y < 0.8 && p.dir.z < -0.5 && p.dir.x === 0, `smer ${JSON.stringify(p.dir)}`);
      assert.ok(Math.abs(p.box.max.y - (4.85 + PLAN_CUT_M)) < 1e-9);
      assert.ok(Math.abs(p.box.min.z - (-0.2 - C)) < 1e-9, 'celý pôdorys, bez zvislého rezu');
    }
  });

  it('plocha a obvod, možnosť b: kolmo zhora, ortografia', () => {
    for (const kind of ['area', 'perimeter'] as const) {
      const p = verifyViewPlan(kind, room, body, [], 'b')!;
      assert.equal(p.projection, 'orthographic');
      assert.deepEqual(p.dir, { x: 0, y: 1, z: 0 });
      assert.ok(Math.abs(p.box.max.y - (4.85 + PLAN_CUT_M)) < 1e-9);
      assert.notEqual(p.up.y, 1, 'pohľad zhora nemá up rovnobežný so smerom');
    }
  });

  it('objem: rez stredom ako pri výške, kamera zošikma zhora (izometria), perspektíva', () => {
    const p = verifyViewPlan('volume', room, body, [])!;
    assert.equal(p.projection, 'perspective');
    assert.ok(Math.abs(p.box.min.z - 3.95) < 1e-9);
    assert.ok(p.dir.y > 0.5 && p.dir.z < -0.4 && p.dir.x > 0.2, `smer ${JSON.stringify(p.dir)}`);
    assert.ok(Math.abs(p.box.max.y - (8.8 + C)) < 1e-9, 'strop rezu tesne nad telesom, doska nad nezakryje pohľad dnu');
  });

  it('miestnosť dlhšia v z: rez a kamera po osi x', () => {
    const tall: Box = { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 12 } };
    const p = verifyViewPlan('height', null, tall, [])!;
    assert.ok(Math.abs(p.box.min.x - 1.95) < 1e-9);
    assert.ok(p.dir.x < -0.9 && p.dir.z === 0);
  });

  it('bez obálky nič', () => {
    assert.equal(verifyViewPlan('height', null, null, [slab]), null);
  });

  it('póza kamery: cieľ v strede rámu, kamera v smere plánu', () => {
    const p = verifyViewPlan('area', room, body, [])!;
    const pose = cameraPose(p);
    assert.ok(Math.abs(pose.target.x - 10) < 1e-9);
    assert.ok(pose.position.y > pose.target.y + 10);
    assert.equal(pose.position.x, pose.target.x);
  });
});
