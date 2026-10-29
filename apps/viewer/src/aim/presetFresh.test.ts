/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyFacePreset, type PresetCallbacks } from './presetFresh.js';

/**
 * Model of the ViewCube cycle in `CameraAnimator` (`lastPresetView` + 0-3
 * rotation counter): the same face again advances it, a diagonal preset
 * clears it. The real camera is covered by `camera-preset-cycle-break.test.ts`
 * in `@ifc-lite/renderer`; this proves the helper uses that contract.
 */
function cycleCamera(): PresetCallbacks & { rotation: number; faces: string[] } {
  let last: string | null = null;
  const cam = {
    rotation: 0,
    faces: [] as string[],
    setPresetView(view: string) {
      if (last === view) cam.rotation = (cam.rotation + 1) % 4;
      else { last = view; cam.rotation = 0; }
      cam.faces.push(`${view}:${cam.rotation}`);
    },
    setPresetDirection() { last = null; cam.rotation = 0; },
  };
  return cam as PresetCallbacks & { rotation: number; faces: string[] };
}

describe('applyFacePreset (AIMviewer#324)', () => {
  it('opakovaný preset=top dá vždy rovnakú orientáciu, nie ďalší krok cyklu', () => {
    const cam = cycleCamera();
    for (let i = 0; i < 5; i++) assert.equal(applyFacePreset(cam, 'top'), true);
    assert.deepEqual(cam.faces, ['top:0', 'top:0', 'top:0', 'top:0', 'top:0']);
  });

  it('cyklus ViewCube bez helpera otáča (kontrola modelu)', () => {
    const cam = cycleCamera();
    cam.setPresetView!('top');
    cam.setPresetView!('top');
    assert.equal(cam.rotation, 1);
  });

  it('bez setPresetView nič nehlási ako hotové', () => {
    assert.equal(applyFacePreset({ setPresetDirection() { throw new Error('nemá sa volať'); } }, 'top'), false);
  });

  it('kamera bez setPresetDirection stále nastaví stranu', () => {
    const faces: string[] = [];
    assert.equal(applyFacePreset({ setPresetView: (v) => { faces.push(v); } }, 'front'), true);
    assert.deepEqual(faces, ['front']);
  });
});
