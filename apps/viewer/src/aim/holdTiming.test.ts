/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOLD_MAX_DEFERRALS, browserInputPendingProbe, shouldDeferHold } from './holdTiming.js';

describe('shouldDeferHold', () => {
  it('waits while the browser has queued input', () => {
    assert.equal(shouldDeferHold(0, () => true), true);
  });

  it('fires once nothing is queued', () => {
    assert.equal(shouldDeferHold(0, () => false), false);
  });

  it('fires without a probe (browser without the API)', () => {
    assert.equal(shouldDeferHold(0, null), false);
  });

  it('gives up after the deferral budget even if the probe keeps reporting input', () => {
    assert.equal(shouldDeferHold(HOLD_MAX_DEFERRALS - 1, () => true), true);
    assert.equal(shouldDeferHold(HOLD_MAX_DEFERRALS, () => true), false);
  });
});

describe('browserInputPendingProbe', () => {
  it('asks for continuous input too, because touchmove is continuous', () => {
    const calls: unknown[] = [];
    const scheduling = { isInputPending(options?: unknown) { calls.push(options); return true; } };
    const probe = browserInputPendingProbe({ scheduling });
    assert.ok(probe);
    assert.equal(probe(), true);
    assert.deepEqual(calls, [{ includeContinuous: true }]);
  });

  it('is null where navigator.scheduling is missing', () => {
    assert.equal(browserInputPendingProbe({}), null);
    assert.equal(browserInputPendingProbe(undefined), null);
  });
});
