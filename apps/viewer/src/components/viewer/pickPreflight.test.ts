/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPickPreflight } from './pickPreflight';

function host(queued: number, opts: { failAt?: number; step?: number } = {}) {
  const state = { queued, slices: 0, flushed: 0, t: 0 };
  return {
    state,
    host: {
      hasQueued: () => state.queued > 0,
      flushSlice: () => {
        state.slices += 1;
        if (opts.failAt === state.slices) return false;
        state.queued -= 1;
        state.t += opts.step ?? 1;
        return true;
      },
      onFlushed: () => { state.flushed += 1; },
      now: () => state.t,
    },
  };
}

describe('createPickPreflight', () => {
  it('does nothing when the queue is empty', () => {
    const h = host(0);
    createPickPreflight(h.host)();
    assert.deepEqual([h.state.slices, h.state.flushed], [0, 0]);
  });

  it('drains the whole queue, then refreshes caches once', () => {
    const h = host(5);
    createPickPreflight(h.host)();
    assert.deepEqual([h.state.queued, h.state.slices, h.state.flushed], [0, 5, 1]);
  });

  it('stops at the deadline so a tap stays responsive', () => {
    const h = host(100, { step: 100 });
    createPickPreflight(h.host, 250)();
    assert.equal(h.state.slices, 3);
    assert.equal(h.state.queued, 97);
    assert.equal(h.state.flushed, 1);
  });

  it('stops on a failed upload and only refreshes if something was uploaded', () => {
    const first = host(5, { failAt: 1 });
    createPickPreflight(first.host)();
    assert.deepEqual([first.state.slices, first.state.flushed], [1, 0]);
    const later = host(5, { failAt: 3 });
    createPickPreflight(later.host)();
    assert.deepEqual([later.state.queued, later.state.flushed], [3, 1]);
  });
});
