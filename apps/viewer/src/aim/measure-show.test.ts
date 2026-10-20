/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { createMeasurementSlice, type MeasurementSlice } from '../store/slices/measurementSlice.js';
import type { MeasurePoint } from '../store/types.js';
import { addHostMeasurements } from './measureShow.js';
import { isViewMessage } from './view-protocol.js';

const S = 'aim-bridge';
const seg = (ax: number, bx: number) => ({ a: { x: ax, y: 2, z: 3 }, b: { x: bx, y: 2, z: 3 } });

describe('kóta od hosta, MEASURE_SHOW (AIM D-124)', () => {
  let state: MeasurementSlice;
  const get = () => state;
  const setPending = (p: MeasurePoint | null) => { state = { ...state, pendingMeasurePoint: p }; };

  beforeEach(() => {
    const set = (partial: Partial<MeasurementSlice> | ((s: MeasurementSlice) => Partial<MeasurementSlice>)) => {
      state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
    };
    state = createMeasurementSlice(set as never, get as never, {} as never);
    // Vyprázdni pamäť kót od hosta z predošlého testu (správa bez keep ich nahrádza).
    addHostMeasurements(get, setPending, { segments: [] }, { x: 0, y: 0, z: 0 });
  });

  it('úsek z IFC sveta (Z hore) do render rámca (Y hore, posunutý) so vzdialenosťou', () => {
    const ids = addHostMeasurements(get, setPending, { segments: [seg(101, 104)] }, { x: 100, y: 0, z: 0 });
    assert.equal(ids.length, 1);
    const [m] = state.measurements;
    assert.deepEqual([m.start.x, m.start.y, m.start.z], [1, 3, -2]);
    assert.deepEqual([m.end.x, m.end.y, m.end.z], [4, 3, -2]);
    assert.equal(m.distance, 3);
  });

  it('nová správa nahradí kóty od hosta, s keep pridá; meranie používateľa a rozpracovaný bod ostanú', () => {
    const userPoint = { x: 9, y: 9, z: 9, screenX: 5, screenY: 5 };
    state.addMeasurePoint({ x: 0, y: 0, z: 0, screenX: 0, screenY: 0 });
    state.completeMeasurement({ x: 0, y: 1, z: 0, screenX: 0, screenY: 0 });
    const userId = state.measurements[0].id;
    state.addMeasurePoint(userPoint);

    addHostMeasurements(get, setPending, { segments: [seg(0, 1), seg(0, 2)] }, { x: 0, y: 0, z: 0 });
    assert.equal(state.measurements.length, 3);
    addHostMeasurements(get, setPending, { segments: [seg(0, 5)] }, { x: 0, y: 0, z: 0 });
    assert.deepEqual(state.measurements.map((m) => m.distance), [1, 5]);
    assert.equal(state.measurements[0].id, userId);
    addHostMeasurements(get, setPending, { segments: [seg(0, 7)], keep: true }, { x: 0, y: 0, z: 0 });
    assert.deepEqual(state.measurements.map((m) => m.distance), [1, 5, 7]);
    assert.deepEqual(state.pendingMeasurePoint, userPoint);
  });

  it('správa: 1 až 12 úsekov s konečnými súradnicami, keep len boolean', () => {
    assert.equal(isViewMessage({ source: S, type: 'MEASURE_SHOW', segments: [seg(0, 1)] }), true);
    assert.equal(isViewMessage({ source: S, type: 'MEASURE_SHOW', segments: [seg(0, 1)], keep: true }), true);
    for (const bad of [
      { source: S, type: 'MEASURE_SHOW', segments: [] },
      { source: S, type: 'MEASURE_SHOW', segments: Array(13).fill(seg(0, 1)) },
      { source: S, type: 'MEASURE_SHOW', segments: [{ a: { x: 0, y: 0, z: 0 } }] },
      { source: S, type: 'MEASURE_SHOW', segments: [{ a: { x: 0, y: 0, z: Number.NaN }, b: { x: 1, y: 0, z: 0 } }] },
      { source: S, type: 'MEASURE_SHOW', segments: [seg(0, 1)], keep: 'yes' },
    ]) {
      assert.equal(isViewMessage(bad), false, JSON.stringify(bad));
    }
  });
});
