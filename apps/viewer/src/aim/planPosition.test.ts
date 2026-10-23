/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { describePlanMarkers, planMarker, type PlanPlacementLike } from './planPosition.js';
import { planPositionState, reportPlanMarker, useAimPlanPosition } from './aimPlanPosition.js';
import { isViewMessage } from './view-protocol.js';
import { SOURCE } from './bridge-protocol.js';

/** Strana 1000 x 500 jednotiek, 1 jednotka = 1 m, začiatok IFC v ľavom dolnom rohu strany. */
const placement: PlanPlacementLike = { affine: [1, 0, 0, 0, 1, 0], pageSize: [1000, 500], page: 1 };
const zero = { x: 0, y: 0, z: 0 };
const up = { x: 0, y: 1, z: 0 };

describe('poloha kamery na PDF (AIM D-161 bod 8, #282)', () => {
  beforeEach(() => {
    useAimPlanPosition.setState({ enabled: true });
    reportPlanMarker('d', 1, null);
  });

  it('bodka sedí na polohe kamery v % strany', () => {
    // svet x = IFC x, svet z = -IFC y; kamera v IFC (250, 125) hľadí na +x
    const m = planMarker(placement, zero, {
      position: { x: 250, y: 1.6, z: -125 },
      target: { x: 260, y: 1.6, z: -125 },
      up,
    });
    assert.ok(m);
    assert.ok(Math.abs(m.left - 25) < 1e-6);
    assert.ok(Math.abs(m.top - 75) < 1e-6);
    assert.ok(Math.abs(m.angleDeg - 90) < 1e-6);
  });

  it('smer: +IFC y je hore na strane (0 stupňov), -IFC x doľava (270)', () => {
    const north = planMarker(placement, zero, { position: { x: 10, y: 0, z: -10 }, target: { x: 10, y: 0, z: -20 }, up });
    assert.ok(north && Math.abs(north.angleDeg) < 1e-6);
    const west = planMarker(placement, zero, { position: { x: 10, y: 0, z: -10 }, target: { x: 0, y: 0, z: -10 }, up });
    assert.ok(west && Math.abs(Math.abs(west.angleDeg) - 90) < 1e-6 && west.angleDeg < 0);
  });

  it('pohľad zhora (cieľ nad kamerou) berie smer z up', () => {
    const m = planMarker(placement, zero, {
      position: { x: 10, y: 20, z: -10 },
      target: { x: 10, y: 0, z: -10 },
      up: { x: 1, y: 0, z: 0 },
    });
    assert.ok(m && Math.abs(m.angleDeg - 90) < 1e-6);
  });

  it('kamera ďaleko mimo výkresu nemá značku, tesne za okrajom áno', () => {
    const cam = (x: number) => ({ position: { x, y: 0, z: -10 }, target: { x: x + 1, y: 0, z: -10 }, up });
    assert.equal(planMarker(placement, zero, cam(5000)), null);
    assert.ok(planMarker(placement, zero, cam(1020)));
  });

  it('degenerovaná strana alebo nekonečná kamera dá null', () => {
    assert.equal(planMarker({ ...placement, pageSize: [0, 500] }, zero, { position: zero, target: { x: 1, y: 0, z: 0 }, up }), null);
    assert.equal(planMarker(placement, zero, { position: { x: NaN, y: 0, z: 0 }, target: zero, up }), null);
  });

  it('stav: zapnuté bez značky, so značkou, vypnuté', () => {
    assert.deepEqual(planPositionState(), { enabled: true, shown: false, markers: [] });
    reportPlanMarker('d', 1, { left: 25.04, top: 75, angleDeg: -90 });
    assert.deepEqual(planPositionState(), {
      enabled: true,
      shown: true,
      markers: [{ document_id: 'd', page: 1, x_pct: 25, y_pct: 75, heading_deg: 270 }],
    });
    useAimPlanPosition.getState().setEnabled(false);
    assert.equal(planPositionState().enabled, false);
    assert.deepEqual(describePlanMarkers(false, []), { enabled: false, shown: false, markers: [] });
  });

  it('dve dlaždice s rôznymi PDF: stav nesie obe značky, zoradené podľa dokumentu a strany', () => {
    reportPlanMarker('b', 2, { left: 10, top: 20, angleDeg: 90 });
    reportPlanMarker('a', 1, { left: 30, top: 40, angleDeg: 0 });
    reportPlanMarker('b', 1, { left: 50, top: 60, angleDeg: 180 });
    const s = planPositionState();
    assert.equal(s.shown, true);
    assert.deepEqual(s.markers.map((m) => `${m.document_id}:${m.page}`), ['a:1', 'b:1', 'b:2']);
    reportPlanMarker('a', 1, null);
    reportPlanMarker('b', 1, null);
    reportPlanMarker('b', 2, null);
  });

  it('správa SET_PLAN_POSITION prejde len s boolean show', () => {
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_PLAN_POSITION', show: false }), true);
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_PLAN_POSITION', show: 'x' }), false);
    assert.equal(isViewMessage({ source: SOURCE, type: 'SET_PLAN_POSITION' }), false);
  });
});
