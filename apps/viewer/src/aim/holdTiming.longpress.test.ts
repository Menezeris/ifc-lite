/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createTouchLongPress } from '../components/viewer/touchLongPress.js';

const touch = (x: number, y: number) => ({ identifier: 1, clientX: x, clientY: y }) as Touch;
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function stubInputPending(isPending: () => boolean): void {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { scheduling: { isInputPending: isPending } } });
}

describe('long press vs queued touchmove', () => {
  beforeEach(() => { mock.timers.enable({ apis: ['setTimeout'] }); });
  afterEach(() => {
    mock.timers.reset();
    if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });

  it('does not hold when the timer is late but a touchmove beyond slop is already queued', () => {
    let queued = true;
    stubInputPending(() => queued);
    const holds: Array<[number, number]> = [];
    const press = createTouchLongPress((x, y) => holds.push([x, y]));
    press.begin(touch(100, 100));
    mock.timers.tick(500); // the late timer runs first: input is queued, so the hold waits
    assert.deepEqual(holds, []);
    queued = false; // the browser delivers the touchmove
    assert.equal(press.move(touch(130, 100)), false, 'moved beyond tap slop: this is an orbit, not a hold');
    mock.timers.tick(10);
    assert.deepEqual(holds, [], 'the cancelled hold never fires');
  });

  it('still holds when the finger stayed down and nothing is queued', () => {
    stubInputPending(() => false);
    const holds: Array<[number, number]> = [];
    const press = createTouchLongPress((x, y) => holds.push([x, y]));
    press.begin(touch(100, 100));
    mock.timers.tick(499);
    assert.deepEqual(holds, []);
    mock.timers.tick(1);
    assert.deepEqual(holds, [[100, 100]]);
    assert.equal(press.end(), true);
  });

  it('holds after the deferral budget even if input keeps being reported', () => {
    stubInputPending(() => true);
    const holds: Array<[number, number]> = [];
    const press = createTouchLongPress((x, y) => holds.push([x, y]));
    press.begin(touch(5, 6));
    mock.timers.tick(500);
    for (let i = 0; i < 60; i++) mock.timers.tick(1);
    assert.deepEqual(holds, [[5, 6]]);
  });
});
