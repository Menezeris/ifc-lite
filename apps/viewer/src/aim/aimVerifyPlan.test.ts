/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  anchorGuids, calculationText, countByStatus, difference, findTarget, formatDifference, formatValue, measureSegments, needsRun,
} from './aimVerifyPlan.js';
import { buildVerifyRequest, isVerifyResult, parseRunAll, parseVerifyElement, safeHref } from './verify-protocol.js';

/** Miestnosť 2.01 z v_verification_latest (ASR rev. 79, register v3), tvar podľa D-185 UI. */
const room201 = {
  version: 1,
  global_id: '3sVKD79KnE69QhEA8lMbzt',
  model: 'ASR',
  revision: 79,
  current_revision: 79,
  stale: false,
  checked_at: '2026-11-01T20:48:19Z',
  registry_version: 3,
  help_href: '/help/verification',
  targets: [
    {
      target: 'Qto_SpaceBaseQuantities.Height',
      status: 'green',
      unit: 'm',
      file_value: 3.95,
      computed_value: 3.95,
      tolerance: { text: 'dĺžka +- 5 mm', abs: 0.005 },
      definition: 'Total height ... (measured from top of slab below to bottom of slab above).',
      spec: { label: 'Qto_SpaceBaseQuantities.Height, IFC 4.3', url: 'https://github.com/buildingSMART/IFC4.3.x-development/blob/d71e140/reference_schemas/psd/Qto_SpaceBaseQuantities.xml' },
      recipes: [
        {
          recipe: 'space.height.slabs@2',
          status: 'green',
          explanation: 'Výška miestnosti je vzdialenosť od vrchu dosky pod miestnosťou po spodok dosky nad ňou.',
          computed_value: 3.95,
          expression: 'A - B',
          cells: [
            { key: 'A', label: 'spodok dosky nad', value: 8.8, unit: 'm', global_id: '3KbvCHlxPANemcN2bON$3q', ref: 'SD02.03.0003' },
            { key: 'B', label: 'vrch dosky pod', value: 4.85, unit: 'm', global_id: '0MJFXziqDE$gGyPWwro9ic', ref: 'SD02.03.0001' },
          ],
          anchors: [
            { z_m: 4.85, role: 'doska pod', global_id: '0MJFXziqDE$gGyPWwro9ic' },
            { z_m: 8.8, role: 'doska nad', global_id: '3KbvCHlxPANemcN2bON$3q' },
          ],
        },
        { recipe: 'space.height.own@1', status: 'green', explanation: 'kontrola: vlastné teleso', computed_value: 3.95, cells: [], anchors: [] },
      ],
    },
    {
      target: 'Qto_SpaceBaseQuantities.GrossVolume',
      status: 'grey',
      unit: 'm3',
      file_value: 912.2699,
      computed_value: null,
      tolerance: { text: 'objem +- 0,5 % alebo +- 0,05 m3', abs: null },
      recipes: [{ recipe: 'space.volume.prism@1', status: 'grey', explanation: 'plocha x výška', computed_value: null, cells: [], anchors: [{ role: 'teleso miestnosti', global_id: '3sVKD79KnE69QhEA8lMbzt' }] }],
    },
  ],
};

describe('overenie výmer: protokol (AIM D-185 UI)', () => {
  it('žiadosť a obálka odpovede', () => {
    const req = buildVerifyRequest('v-1', 'latest', { global_id: 'G' });
    assert.deepEqual(req, { source: 'aim-bridge', type: 'VERIFY_REQUEST', id: 'v-1', action: 'latest', payload: { global_id: 'G' } });
    assert.equal(isVerifyResult({ source: 'aim-bridge', type: 'VERIFY_RESULT', id: 'v-1', ok: true, data: {} }), true);
    assert.equal(isVerifyResult({ source: 'aim-bridge', type: 'VERIFY_RESULT', id: '', ok: true }), false);
    assert.equal(isVerifyResult({ source: 'aim-bridge', type: 'VERIFY_RESULT', id: 'x', ok: 'yes' }), false);
    assert.equal(isVerifyResult({ source: 'other', type: 'VERIFY_RESULT', id: 'x', ok: true }), false);
  });

  it('prvok: bunky, hlavný recept prvý, odkaz len http(s) alebo cesta hosta', () => {
    const el = parseVerifyElement(room201);
    assert.ok(el);
    assert.equal(el.targets.length, 2);
    const h = el.targets[0];
    assert.deepEqual(h.recipes.map((r) => r.recipe), ['space.height.slabs@2', 'space.height.own@1']);
    assert.deepEqual(h.recipes[0].cells.map((c) => [c.key, c.ref, c.value]), [['A', 'SD02.03.0003', 8.8], ['B', 'SD02.03.0001', 4.85]]);
    assert.equal(h.spec?.url.startsWith('https://github.com/buildingSMART/'), true);
    assert.equal(el.help_href, '/help/verification');
    assert.equal(safeHref('javascript:alert(1)'), undefined);
    assert.equal(safeHref('//evil.example/x'), undefined);
  });

  it('nesprávny tvar sa zahodí: verzia, stav, jednotka, recept bez mena', () => {
    assert.equal(parseVerifyElement({ ...room201, version: 2 }), null);
    assert.equal(parseVerifyElement({ ...room201, global_id: 5 }), null);
    const bad = parseVerifyElement({
      ...room201,
      targets: [
        { ...room201.targets[0], status: 'blue' },
        { ...room201.targets[0], unit: 'ft' },
        { ...room201.targets[0], recipes: [{ status: 'green' }] },
        { ...room201.targets[0], spec: { label: 'x', url: 'javascript:alert(1)' } },
      ],
    });
    assert.ok(bad);
    assert.equal(bad.targets.length, 1);
    assert.equal(bad.targets[0].spec, undefined);
  });

  it('súhrn behu celého modelu', () => {
    assert.deepEqual(parseRunAll({ check: 'space_quantities', elements: 54, counts: { green: 300, red: 2 } })?.counts, { green: 300, yellow: 0, red: 2, grey: 0 });
    assert.equal(parseRunAll({ check: 'space_quantities' }), null);
  });
});

describe('overenie výmer: riadok, čísla, kóty (AIM D-185 UI)', () => {
  const el = parseVerifyElement(room201)!;

  it('riadok veličiny nájde svoj výsledok; iná sada ani veličina bez receptu nie', () => {
    assert.equal(findTarget(el, 'Qto_SpaceBaseQuantities', 'Height')?.status, 'green');
    assert.equal(findTarget(el, 'Qto_SpaceBaseQuantities', 'NetFloorArea'), null);
    assert.equal(findTarget(el, 'Pset_SpaceCommon', 'Height'), null);
    assert.equal(findTarget(null, 'Qto_SpaceBaseQuantities', 'Height'), null);
  });

  it('rozdiel a slovenský zápis čísel', () => {
    assert.equal(difference({ file_value: 67.442, computed_value: 67.2493 })?.toFixed(4), '-0.1927');
    assert.equal(difference({ file_value: 912.2699, computed_value: null }), null);
    assert.equal(formatValue(3.95, 'm'), '3,950 m');
    assert.equal(formatValue(67.442, 'm3'), '67,4420 m³');
    assert.equal(formatValue(null, 'm'), '-');
    assert.equal(formatDifference(0.0033, 'm'), '+3 mm');
    assert.equal(formatDifference(-0.0071, 'm2'), '-0,0071 m²');
    assert.equal(formatDifference(0, 'm'), '0 mm');
  });

  it('stavy, opakovanie behu len pre chýbajúci alebo zastaraný výsledok', () => {
    assert.deepEqual(countByStatus(el), { green: 1, yellow: 0, red: 0, grey: 1 });
    assert.equal(needsRun(el), false);
    assert.equal(needsRun({ ...el, stale: true }), true);
    assert.equal(needsRun({ ...el, targets: [] }), true);
    assert.equal(needsRun(null), true);
  });

  it('kóta v strede pôdorysu od najnižšej po najvyššiu kotvu; úseky od hosta majú prednosť', () => {
    const h = el.targets[0];
    const box = { min: { x: 10, y: 20, z: 4.85 }, max: { x: 30, y: 40, z: 8.8 } };
    assert.deepEqual(measureSegments(h.recipes[0], box), [{ a: { x: 20, y: 30, z: 4.85 }, b: { x: 20, y: 30, z: 8.8 } }]);
    assert.deepEqual(measureSegments(h.recipes[0], null), []);
    assert.deepEqual(measureSegments(el.targets[1].recipes[0], box), [], 'objem nemá výšky kotiev');
    const own = { ...h.recipes[0], segments: [{ a: [1, 2, 3] as [number, number, number], b: [1, 2, 7] as [number, number, number] }] };
    assert.deepEqual(measureSegments(own, box), [{ a: { x: 1, y: 2, z: 3 }, b: { x: 1, y: 2, z: 7 } }]);
    assert.deepEqual(anchorGuids(h), ['0MJFXziqDE$gGyPWwro9ic', '3KbvCHlxPANemcN2bON$3q']);
  });

  it('text výpočtu na skopírovanie má bunky s prvkom a porovnanie', () => {
    const text = calculationText(el.targets[0]);
    assert.match(text, /A = spodok dosky nad \(SD02\.03\.0003\) = 8,800 m/);
    assert.match(text, /= A - B = 3,950 m/);
    assert.match(text, /rozdiel 0 mm, tolerancia dĺžka \+- 5 mm/);
  });
});
