/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TAP_MAX_MS, inputStamp, tapDurationMs } from './tapTiming.js';

describe('inputStamp', () => {
  it('uses the browser input time when the event has one', () => {
    assert.equal(inputStamp({ timeStamp: 1234.5 }, () => 9), 1234.5);
  });

  it('falls back to the clock for synthetic events without a usable stamp', () => {
    assert.equal(inputStamp({}, () => 9), 9);
    assert.equal(inputStamp({ timeStamp: 0 }, () => 9), 9);
    assert.equal(inputStamp({ timeStamp: Number.NaN }, () => 9), 9);
  });
});

describe('tapDurationMs', () => {
  it('is the gap between the two input stamps', () => {
    assert.equal(tapDurationMs(1000, 1050), 50);
  });

  it('never counts unusable stamps as a tap', () => {
    assert.equal(tapDurationMs(1000, 900), Number.POSITIVE_INFINITY);
    assert.equal(tapDurationMs(Number.NaN, 900), Number.POSITIVE_INFINITY);
    assert.ok(!(tapDurationMs(1000, 900) < TAP_MAX_MS));
  });

  it('keeps a tap whose handlers ran 400 ms apart but whose inputs arrived 50 ms apart', () => {
    // The handler clock (Date.now) saw 400 ms because the main thread was blocked; the browser stamped 50 ms.
    const handlerClockGap = 400;
    assert.ok(handlerClockGap >= TAP_MAX_MS, 'the old measure would drop this tap');
    assert.ok(tapDurationMs(1000, 1050) < TAP_MAX_MS);
  });
});
