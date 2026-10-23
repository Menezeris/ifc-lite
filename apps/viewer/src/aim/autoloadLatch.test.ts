/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createAutoloadLatch } from './autoloadLatch.js';

describe('createAutoloadLatch (lenivý most AIM)', () => {
  it('callback prihlásený pred koncom autoloadu beží pri konci, raz', () => {
    const latch = createAutoloadLatch(true);
    let calls = 0;
    latch.onComplete(() => calls++);
    assert.strictEqual(calls, 0);
    latch.complete();
    latch.complete();
    assert.strictEqual(calls, 1);
  });

  it('most pripojený až po konci autoloadu dostane callback hneď', () => {
    const latch = createAutoloadLatch(true);
    latch.complete();
    let calls = 0;
    latch.onComplete(() => calls++);
    assert.strictEqual(calls, 1);
  });

  it('odhlásený callback (odpojený most) sa nezavolá', () => {
    const latch = createAutoloadLatch(true);
    let calls = 0;
    const off = latch.onComplete(() => calls++);
    off();
    latch.complete();
    assert.strictEqual(calls, 0);
  });
});
