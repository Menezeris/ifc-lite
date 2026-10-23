/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTO_ROTATE_SPEED, MAX_STEP_MS, poseMoved, rotateAboutY, rotationAngle, stepPose, type Pose } from './autoRotatePlan.js';
import { isViewMessage } from './view-protocol.js';

const S = 'aim-bridge';
// Render rámec (Y hore): kamera 10 m pred cieľom, teda na juhu (IFC -Y = render +Z), pohľad na sever.
const pose = (): Pose => ({ position: { x: 5, y: 3, z: 12 }, target: { x: 5, y: 3, z: 2 }, up: { x: 0, y: 1, z: 0 } });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

describe('AUTO_ROTATE: matematika otáčania (AIM #247)', () => {
  it('left obieha kameru doľava (juh -> západ = render -X), right doprava', () => {
    const left = stepPose(pose(), rotationAngle(90, 'left', 1000 / 12));
    const right = stepPose(pose(), rotationAngle(90, 'right', 1000 / 12));
    assert.ok(left.position.x < 5, 'doľava = X klesá');
    assert.ok(right.position.x > 5, 'doprava = X rastie');
    near(left.position.x - 5, -(right.position.x - 5));
  });

  it('otáča okolo cieľa: vzdialenosť, výška a cieľ ostanú, po 360 stupňoch je pohľad pôvodný', () => {
    let vp = pose();
    for (let i = 0; i < 360; i++) vp = stepPose(vp, rotationAngle(90, 'left', 1000 / 90));
    assert.deepEqual(vp.target, pose().target);
    near(vp.position.y, 3);
    near(Math.hypot(vp.position.x - 5, vp.position.z - 2), 10);
    near(vp.position.x, 5);
    near(vp.position.z, 12);
  });

  it('rýchlosť sa mení s časom: 90 stupňov za sekundu = štvrťotáčka za 1000 ms', () => {
    const v = rotateAboutY({ x: 0, y: 0, z: 10 }, Math.PI / 2);
    near(v.x, 10);
    near(rotationAngle(90, 'right', 100), (Math.PI / 2) / 10);
    assert.equal(rotationAngle(30, 'left', 50) < 0, true);
  });

  it('dlhý krok (karta v pozadí) sa zreže na MAX_STEP_MS, záporný čas je nula', () => {
    assert.equal(rotationAngle(10, 'right', 60_000), rotationAngle(10, 'right', MAX_STEP_MS));
    assert.equal(rotationAngle(10, 'right', -5), 0);
  });

  it('up sa otočí s kamerou: pohľad zhora sa točí v rovine, zvislý up ostane', () => {
    const top: Pose = { position: { x: 0, y: 20, z: 0 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 } };
    const turned = stepPose(top, Math.PI / 2);
    near(turned.position.x, 0);
    near(turned.position.y, 20);
    assert.ok(Math.abs(turned.up.x) > 0.99, 'up sa stočil do osi X');
    assert.deepEqual(stepPose(pose(), 0.3).up, { x: 0, y: 1, z: 0 });
  });

  it('poseMoved: vlastný krok nie je zásah, posun alebo iný cieľ áno', () => {
    const a = pose();
    assert.equal(poseMoved(a, { ...a }), false);
    assert.equal(poseMoved(a, { ...a, position: { ...a.position, x: a.position.x + 1e-6 } }), false);
    assert.equal(poseMoved(a, { ...a, position: { ...a.position, x: a.position.x + 0.5 } }), true);
    assert.equal(poseMoved(a, { ...a, target: { ...a.target, y: a.target.y + 0.5 } }), true);
  });
});

describe('AUTO_ROTATE: obálka mosta', () => {
  it('prejde start so rýchlosťou a smerom aj samotné stop', () => {
    for (const msg of [
      { source: S, type: 'AUTO_ROTATE', action: 'start' },
      { source: S, type: 'AUTO_ROTATE', action: 'start', speedDegS: 5, direction: 'right' },
      { source: S, type: 'AUTO_ROTATE', action: 'start', speedDegS: AUTO_ROTATE_SPEED.max, direction: 'left' },
      { source: S, type: 'AUTO_ROTATE', action: 'stop' },
    ]) assert.equal(isViewMessage(msg), true, JSON.stringify(msg));
  });

  it('odmietne neznámu akciu, smer, rýchlosť mimo rozsahu, NaN a cudzí zdroj', () => {
    for (const msg of [
      { source: S, type: 'AUTO_ROTATE' },
      { source: S, type: 'AUTO_ROTATE', action: 'spin' },
      { source: S, type: 'AUTO_ROTATE', action: 'start', direction: 'up' },
      { source: S, type: 'AUTO_ROTATE', action: 'start', speedDegS: 0 },
      { source: S, type: 'AUTO_ROTATE', action: 'start', speedDegS: AUTO_ROTATE_SPEED.max + 1 },
      { source: S, type: 'AUTO_ROTATE', action: 'start', speedDegS: Number.NaN },
      { source: 'x', type: 'AUTO_ROTATE', action: 'start' },
    ]) assert.equal(isViewMessage(msg), false, JSON.stringify(msg));
  });
});
