/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ACK_TOTAL_MS, STATE_RESERVE_MS, createAckBudget, withinBudget } from './ackBudget.js';

describe('rozpočet času na APPLIED (AIM #273)', () => {
  it('celý rozpočet je pod 3 s hosta a kroky nespotrebujú rezervu na stav', () => {
    assert.ok(ACK_TOTAL_MS < 3000);
    let t = 0;
    const b = createAckBudget(ACK_TOTAL_MS, () => t);
    assert.equal(b.left(), ACK_TOTAL_MS);
    assert.equal(b.stepLeft(), ACK_TOTAL_MS - STATE_RESERVE_MS);
    t = ACK_TOTAL_MS - 100;
    assert.equal(b.left(), 100);
    assert.equal(b.stepLeft(), 0);
    t = ACK_TOTAL_MS + 5000;
    assert.equal(b.left(), 0);
  });

  it('pomalý stav vráti náhradu v limite, rýchly ide cez', async () => {
    const never = new Promise<string>(() => undefined);
    assert.equal(await withinBudget(never, 5, () => 'late', (ms) => new Promise((r) => setTimeout(r, ms))), 'late');
    assert.equal(await withinBudget(Promise.resolve('ok'), 50, () => 'late'), 'ok');
  });

  it('neskorá chyba po timeoute nespadne ako neošetrená', async () => {
    const slow = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('neskoro')), 20));
    assert.equal(await withinBudget(slow, 1, () => 'late'), 'late');
    await new Promise((r) => setTimeout(r, 40));
  });
});
