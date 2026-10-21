/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { waitCameraSettled, type PoseSample } from './cameraSettle.js';

const pose = (x: number): PoseSample => ({ position: { x, y: -41, z: 45 }, target: { x: 46, y: 2, z: 8 } });

/** Falošné hodiny: každý `sleep` posunie čas, `read` vráti ďalšiu vzorku (posledná ostáva). */
function fake(samples: (PoseSample | null)[]) {
  let t = 0;
  let i = 0;
  const reads: number[] = [];
  return {
    read: () => { reads.push(t); return samples[Math.min(i++, samples.length - 1)]; },
    opts: { stepMs: 50, maxMs: 1000, now: () => t, sleep: async (ms: number) => { t += ms; } },
    reads,
    elapsed: () => t,
  };
}

describe('APPLIED počká na dobehnutie animácie kamery (AIM #97, D-122)', () => {
  it('počas animácie čaká, kým sa póza neustáli, a stav sa číta až potom', async () => {
    const f = fake([pose(90), pose(80), pose(71.98), pose(55), pose(46.6), pose(46.6)]);
    assert.equal(await waitCameraSettled(f.read, f.opts), true);
    assert.equal(f.elapsed(), 250, 'päť krokov po 50 ms, kým sa dve vzorky zhodli');
  });

  it('pokojná kamera nezdrží: jedna kontrola', async () => {
    const f = fake([pose(90), pose(90)]);
    assert.equal(await waitCameraSettled(f.read, f.opts), true);
    assert.equal(f.elapsed(), 50);
  });

  it('horný limit: kamera v pohybe stále, vráti false po maxMs', async () => {
    let x = 0;
    const moving = () => pose((x += 1));
    const f = fake([]);
    assert.equal(await waitCameraSettled(moving, f.opts), false);
    assert.equal(f.elapsed(), 1000);
  });

  it('posúva sa len cieľ (pan): čaká aj na neho', async () => {
    const t = (y: number): PoseSample => ({ position: { x: 90, y: -41, z: 45 }, target: { x: 46, y, z: 8 } });
    const f = fake([t(0), t(1), t(2), t(2)]);
    assert.equal(await waitCameraSettled(f.read, f.opts), true);
    assert.equal(f.elapsed(), 150);
  });

  it('bez kamery nečaká', async () => {
    const f = fake([null]);
    assert.equal(await waitCameraSettled(f.read, f.opts), true);
    assert.equal(f.elapsed(), 0);
  });
});
