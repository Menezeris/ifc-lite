/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { Camera } from './camera.js';
import { viewBasis } from './math.js';
import type { Vec3 } from './types.js';

// AIMviewer#324: a host `preset=top` must not depend on earlier clicks. The
// face-click cycle (+90 deg on the same face again) is ended by a diagonal
// preset, which the AIM bridge issues right before the face.
const BOUNDS = { min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 10, z: 10 } };
const DIAGONAL = { x: 1, y: 1, z: 1 };

function settle(camera: Camera, move: () => void): void {
  const originalNow = Date.now;
  const originalRaf = Reflect.get(globalThis, 'requestAnimationFrame');
  let now = 1_000;
  Date.now = () => now;
  Reflect.set(globalThis, 'requestAnimationFrame', () => 0);
  try {
    move();
    now += 400;
    camera.update(0);
  } finally {
    Date.now = originalNow;
    Reflect.set(globalThis, 'requestAnimationFrame', originalRaf);
  }
}

function screenUp(camera: Camera): Vec3 {
  return viewBasis(camera.getPosition(), camera.getTarget(), camera.getUp()).up;
}

function freshTop(camera: Camera): void {
  settle(camera, () => {
    camera.setPresetDirection(DIAGONAL, BOUNDS);
    camera.setPresetView('top', BOUNDS);
  });
}

describe('Camera preset cycle break (AIMviewer#324)', () => {
  it('plain repeated top turns by 90 degrees (ViewCube behaviour stays)', () => {
    const camera = new Camera();
    settle(camera, () => camera.setPresetView('top', BOUNDS));
    const first = screenUp(camera);
    settle(camera, () => camera.setPresetView('top', BOUNDS));
    const second = screenUp(camera);
    assert.ok(Math.abs(first.x * second.x + first.z * second.z) < 1e-6, 'second top is perpendicular to the first');
  });

  it('diagonal before top gives the first-click orientation every time', () => {
    const camera = new Camera();
    freshTop(camera);
    const first = screenUp(camera);
    const pos = camera.getPosition();
    for (let i = 0; i < 3; i++) {
      freshTop(camera);
      const up = screenUp(camera);
      assert.ok(Math.abs(up.x - first.x) < 1e-6 && Math.abs(up.z - first.z) < 1e-6, `repeat ${i}: ${JSON.stringify(up)} vs ${JSON.stringify(first)}`);
      assert.ok(Math.abs(camera.getPosition().y - pos.y) < 1e-6);
    }
  });

  it('framing a target after the preset keeps the preset orientation', () => {
    const camera = new Camera();
    freshTop(camera);
    const first = screenUp(camera);
    settle(camera, () => { void camera.frameBounds({ x: 30, y: 0, z: 0 }, { x: 33, y: 3, z: 3 }, 300); });
    const framed = screenUp(camera);
    assert.ok(Math.abs(framed.x - first.x) < 1e-6 && Math.abs(framed.z - first.z) < 1e-6);
  });
});
