/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Pripomienky Samuela 3. 11. (D-185 UI): odkazy na prvky, kóty viacerých veličín, odvodené bunky. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { derivedLabel, fillRefs, inputRows, linkifyRefs, refIndex, segmentsForTargets, SIDE_BY_SIDE_M } from './aimVerifyPlan.js';
import { parseVerifyElement, type VerifyRecipeWire } from './verify-protocol.js';

const ROOM = '3sVKD79KnE69QhEA8lMbzt';
const FLOOR = '3SGLsPPzv2uO12ZvDuRW11';
const CEIL = '1p976dHij4OvmBakdSw2J$';

/** FinishFloorHeight 2.01 tak, ako ho dnes vracia motor (bunky chýbajú, prvky len v kotvách). */
const ffh: VerifyRecipeWire = {
  recipe: 'space.ffh.covering@3',
  status: 'green',
  explanation: 'vrch podlahoviny - spodok telesa miestnosti',
  computed_value: 0.15,
  expression: 'A - B',
  cells: [],
  formula_text: 'vrch(podlahovina) - spodok(miestnosť) = 5 - 4.85 = 0.15 m',
  anchors: [
    { global_id: ROOM, role: 'teleso miestnosti', z_m: 4.85 },
    { global_id: FLOOR, role: 'podlahovina', z_m: 5 },
    { global_id: FLOOR, role: 'podlahovina', z_m: 5 },
  ],
};

const names: Record<string, string> = { [ROOM]: '2.01', [FLOOR]: 'PD02.10.03', [CEIL]: 'PH01.10.0001' };

describe('fillRefs + inputRows', () => {
  it('prvky bez kódu od hosta dostanú meno z IFC a ukážu sa ako vstupné prvky, každý raz', () => {
    const r = fillRefs(ffh, (g) => names[g]);
    assert.deepEqual(inputRows(r), [
      { role: 'teleso miestnosti', global_id: ROOM, ref: '2.01', z_m: 4.85 },
      { role: 'podlahovina', global_id: FLOOR, ref: 'PD02.10.03', z_m: 5 },
    ]);
  });

  it('kód od hosta má prednosť pred menom z IFC; recept s bunkami vstupné prvky neopakuje', () => {
    const r = fillRefs({ ...ffh, anchors: [{ global_id: FLOOR, role: 'podlahovina', ref: 'HOST' }] }, (g) => names[g]);
    assert.equal(r.anchors[0].ref, 'HOST');
    const withCells = { ...ffh, cells: [{ key: 'A', label: 'vrch podlahoviny', value: 5, unit: 'm', global_id: FLOOR }] };
    assert.deepEqual(inputRows(withCells), []);
    assert.equal(fillRefs(withCells, (g) => names[g]).cells[0].ref, 'PD02.10.03');
  });
});

describe('linkifyRefs', () => {
  const nv: VerifyRecipeWire = {
    ...ffh,
    recipe: 'space.netvolume.coverings@3',
    formula_text: 'GrossVolume - PD02.10.03 - PH01.10.0001 - PD02.11.0001 = 67.44 m3',
    anchors: [
      { global_id: ROOM, role: 'teleso miestnosti', ref: '2.01' },
      { global_id: FLOOR, role: 'krytina', ref: 'PD02.10.03' },
      { global_id: CEIL, role: 'krytina', ref: 'PH01.10.0001' },
    ],
  };

  it('kódy krytín v texte sú odkazy na prvky, neznámy kód ostane text', () => {
    const parts = linkifyRefs(nv.formula_text!, refIndex(nv));
    assert.deepEqual(parts.filter((p) => 'ref' in p), [{ ref: 'PD02.10.03', guid: FLOOR }, { ref: 'PH01.10.0001', guid: CEIL }]);
    assert.equal(parts.map((p) => ('ref' in p ? p.ref : p.text)).join(''), nv.formula_text, 'text ostane celý');
  });

  it('kód sa nechytí vo vnútri dlhšieho kódu; číslo miestnosti v texte nie je odkaz', () => {
    const idx = refIndex(nv);
    assert.equal(idx.has('2.01'), false);
    assert.deepEqual(linkifyRefs('PD02.10.031 a PD02.10.03.', idx).filter((p) => 'ref' in p), [{ ref: 'PD02.10.03', guid: FLOOR }]);
    assert.deepEqual(linkifyRefs('výška 2.01 m', new Map([['2.01', ROOM]])).filter((p) => 'ref' in p).length, 1, 'bez filtra by sa chytilo');
  });
});

describe('segmentsForTargets', () => {
  const el = parseVerifyElement({
    version: 1, global_id: ROOM, targets: [
      { target: 'Qto_SpaceBaseQuantities.Height', status: 'green', unit: 'm', file_value: 3.95, computed_value: 3.95, tolerance: { text: '' },
        recipes: [{ recipe: 'space.height.slabs@2', status: 'green', explanation: 'x', cells: [], anchors: [{ global_id: 'a', role: 'doska pod', z_m: 4.85 }, { global_id: 'b', role: 'doska nad', z_m: 8.8 }] }] },
      { target: 'Qto_SpaceBaseQuantities.FinishFloorHeight', status: 'green', unit: 'm', file_value: 0.15, computed_value: 0.15, tolerance: { text: '' },
        recipes: [ffh] },
    ],
  });
  const box = { min: { x: 0, y: 0, z: 4.85 }, max: { x: 20, y: 8, z: 8.8 } };

  it('kóty zapnutých veličín naraz, vedľa seba pozdĺž dlhšej strany, aby sa čísla neprekrývali', () => {
    const s = segmentsForTargets(el, ['Qto_SpaceBaseQuantities.Height', 'Qto_SpaceBaseQuantities.FinishFloorHeight'], box);
    assert.equal(s.length, 2);
    assert.deepEqual([s[0].a.z, s[0].b.z], [4.85, 8.8]);
    assert.deepEqual([s[1].a.z, s[1].b.z], [4.85, 5]);
    assert.ok(Math.abs(s[1].a.x - s[0].a.x - SIDE_BY_SIDE_M) < 1e-9);
    assert.equal(s[1].a.y, s[0].a.y);
  });

  it('bez zapnutých veličín nič; neznáma veličina nič', () => {
    assert.deepEqual(segmentsForTargets(el, [], box), []);
    assert.deepEqual(segmentsForTargets(el, ['Qto_X.Y'], box), []);
  });
});

describe('odvodená bunka', () => {
  it('protokol prenesie odkaz na inú výmeru a kód kotvy; zápis "hodnota (meno)"', () => {
    const el = parseVerifyElement({
      version: 1, global_id: ROOM, targets: [{
        target: 'Qto_SpaceBaseQuantities.GrossVolume', status: 'green', unit: 'm3', file_value: 1, computed_value: 1, tolerance: { text: '' },
        recipes: [{ recipe: 'r', status: 'green', explanation: 'x', anchors: [{ global_id: FLOOR, role: 'krytina', ref: 'PD02.10.03' }],
          cells: [
            { key: 'A', label: 'plocha', value: 72, unit: 'm2', quantity: 'Qto_SpaceBaseQuantities.NetFloorArea' },
            { key: 'B', label: 'zlé', value: 1, unit: 'm', quantity: 'bezbodky' },
          ] }],
      }],
    })!;
    const r = el.targets[0].recipes[0];
    assert.equal(r.cells[0].quantity, 'Qto_SpaceBaseQuantities.NetFloorArea');
    assert.equal(r.cells[1].quantity, undefined, 'odkaz bez sady sa zahodí');
    assert.equal(r.anchors[0].ref, 'PD02.10.03');
    assert.equal(derivedLabel(72, 'm2', 'Qto_SpaceBaseQuantities.NetFloorArea'), '72,0000 m² (NetFloorArea)');
  });
});
