/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeUnderlays, isUnderlaysViewWire, planUnderlaySet, restoreUnderlays, snapshotUnderlays, underlayIn3d,
  type CalibratedDrawing,
} from './underlaysPlan.js';

const drawing = (id: string, storey: string, over: Partial<CalibratedDrawing['placement']> = {}): CalibratedDrawing => ({
  id, name: `ASR ${storey}`,
  placement: { visible: true, opacity: 0.7, page: 1, storeyGuid: `G-${storey}`, storeyZ: 0, discipline: 'ARCH', calibratedAt: '2026-10-01T10:00:00Z', ...over },
});
const D1 = drawing('d1', '1NP');
const D2 = drawing('d2', '2NP', { storeyZ: 3.2, page: 2 });
const D3 = drawing('d3', '3NP', { visible: false });

describe('jednotlivé podklady v 3D (AIM #323)', () => {
  it('prepis zapne podklad vypnutý v kalibrácii a zmení priehľadnosť; store ostane nedotknutý', () => {
    const p = { visible: false, opacity: 0.7, affine: [1, 0, 0, 0, 1, 0] };
    const out = underlayIn3d(p, { visible: true, opacity: 0.3 }, false);
    assert.deepEqual([out.visible, out.opacity], [true, 0.3]);
    assert.deepEqual(out.affine, p.affine);
    assert.equal(p.visible, false);
  });

  it('globálne vypnutie v 3D prebije prepis podkladu', () => {
    assert.equal(underlayIn3d({ visible: true, opacity: 1 }, { visible: true }, true).visible, false);
  });

  it('bez prepisu a skrytia vráti ten istý objekt (renderer nič neprepočíta)', () => {
    const p = { visible: true, opacity: 0.5 };
    assert.equal(underlayIn3d(p, undefined, false), p);
    assert.equal(underlayIn3d(p, {}, false), p);
  });

  it('planUnderlaySet zlúči položku s doterajším prepisom, iné podklady nemení', () => {
    const { overrides, unknown } = planUnderlaySet([D1, D2], { d2: { opacity: 0.2 } }, [{ document_id: 'd2', visible: true }], false);
    assert.deepEqual(overrides, { d2: { opacity: 0.2, visible: true } });
    assert.deepEqual(unknown, []);
  });

  it('only vypne v 3D všetky ostatné kalibrované podklady', () => {
    const { overrides } = planUnderlaySet([D1, D2, D3], {}, [{ document_id: 'd2', visible: true }], true);
    assert.deepEqual(overrides, { d1: { visible: false }, d2: { visible: true }, d3: { visible: false } });
  });

  it('neznámy alebo nekalibrovaný podklad ide do unknown a nič nezapíše', () => {
    const { overrides, unknown } = planUnderlaySet([D1], {}, [{ document_id: 'x9', visible: true }], false);
    assert.deepEqual(overrides, {});
    assert.deepEqual(unknown, ['x9']);
  });

  it('describeUnderlays: účinný stav v 3D, uložené hodnoty a príznak prepisu', () => {
    const [a, b] = describeUnderlays([D1, D2], { d2: { visible: false, opacity: 0.4 } });
    assert.deepEqual([a.visible, a.opacity, a.overridden, a.saved], [true, 0.7, false, { visible: true, opacity: 0.7 }]);
    assert.deepEqual([b.document_id, b.page, b.storey_guid, b.storey_z], ['d2', 2, 'G-2NP', 3.2]);
    assert.deepEqual([b.visible, b.opacity, b.overridden, b.saved.visible], [false, 0.4, true, true]);
  });
});

describe('podklady v uloženom pohľade (AIM #325)', () => {
  it('snímka nesie prepínač 3D a účinný stav každého kalibrovaného podkladu', () => {
    const w = snapshotUnderlays([D1, D2, D3], { d1: { visible: false }, d2: { opacity: 0.5 } }, true);
    assert.deepEqual(w, {
      show: true,
      items: [
        { document_id: 'd1', visible: false, opacity: 0.7 },
        { document_id: 'd2', visible: true, opacity: 0.5 },
        { document_id: 'd3', visible: false, opacity: 0.7 },
      ],
    });
    assert.equal(isUnderlaysViewWire(w), true);
  });

  it('obnova nahradí prepisy celé: izolované 2NP ukáže len podklad 2NP', () => {
    const w = snapshotUnderlays([D1, D2], planUnderlaySet([D1, D2], {}, [{ document_id: 'd2', visible: true }], true).overrides, true);
    const { shown, overrides } = restoreUnderlays(w);
    assert.equal(shown, true);
    assert.equal(underlayIn3d(D1.placement, overrides.d1, !shown).visible, false);
    assert.equal(underlayIn3d(D2.placement, overrides.d2, !shown).visible, true);
  });

  it('isUnderlaysViewWire odmietne priehľadnosť mimo 0 až 1 a položku bez visible', () => {
    assert.equal(isUnderlaysViewWire({ show: true, items: [{ document_id: 'd1', visible: true, opacity: 2 }] }), false);
    assert.equal(isUnderlaysViewWire({ show: true, items: [{ document_id: 'd1', opacity: 0.5 }] }), false);
    assert.equal(isUnderlaysViewWire({ show: 'yes', items: [] }), false);
  });
});
