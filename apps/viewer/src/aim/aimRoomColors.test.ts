/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { roomColorMap } from './aimRoomColors.js';

const ORANGE = '#f97316';
const BLUE = '#2563eb';
const base = { lens: new Map<number, string>(), selected: [] as number[], isRoom: (id: number) => id < 100, focused: [] as number[], selectedColor: BLUE, focusColor: ORANGE };

describe('farby miestností pre výplň (AIM #319)', () => {
  it('zvýraznená miestnosť (show_in_3d) dostane oranžovú, hoci ju Lens nefarbí', () => {
    assert.equal(roomColorMap({ ...base, focused: [7] }).get(7), ORANGE);
  });

  it('FOCUS prebíja farbu Lens aj výberu', () => {
    const colors = roomColorMap({ ...base, lens: new Map([[7, '#22c55e']]), selected: [7, 8], focused: [7, 8] });
    assert.equal(colors.get(7), ORANGE);
    assert.equal(colors.get(8), ORANGE);
  });

  it('bez FOCUS ostáva Lens a výber ako predtým', () => {
    const colors = roomColorMap({ ...base, lens: new Map([[7, '#22c55e']]), selected: [7, 8] });
    assert.equal(colors.get(7), '#22c55e');
    assert.equal(colors.get(8), BLUE);
  });

  it('prvok, ktorý nie je miestnosť s geometriou (stena), sa nefarbí', () => {
    assert.equal(roomColorMap({ ...base, focused: [500], selected: [501] }).size, 0);
  });
});
