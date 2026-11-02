/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { idsEngineVersion, libraryStateText, runStateText, runsByModel, sha256Hex, type ReportSpecLike } from './reqlibPlan.js';
import { buildReqlibRequest, isReqlibResult } from './reqlib-protocol.js';

const spec = (status: string, entities: ReportSpecLike['entityResults']): ReportSpecLike => ({
  specification: { id: 's1', identifier: 'IU-O-space', name: 'Priestor' },
  status,
  applicableCount: entities.length,
  entityResults: entities,
});

describe('knižnica požiadaviek: výsledok po modeloch (AIM D-182)', () => {
  it('beh nad dvoma modelmi sa rozdelí; stav špecifikácie podľa prvkov modelu; dôvody len nesplnených požiadaviek', () => {
    const runs = runsByModel([
      spec('fail', [
        { modelId: 'A', globalId: 'G1', entityType: 'IfcSpace', passed: true, requirementResults: [{ status: 'pass', failureReason: 'x' }] },
        { modelId: 'B', globalId: 'G2', entityType: 'IfcSpace', passed: false, requirementResults: [{ status: 'pass' }, { status: 'fail', failureReason: 'LongName chýba' }] },
      ]),
    ], ['A', 'B'], (id) => `${id}.ifc`);
    assert.deepEqual(runs.map((r) => [r.model_id, r.model_name, r.specs[0].status, r.specs[0].applicableCount]), [
      ['A', 'A.ifc', 'pass', 1],
      ['B', 'B.ifc', 'fail', 1],
    ]);
    assert.deepEqual(runs[0].specs[0].entityResults[0].requirementResults, []);
    assert.deepEqual(runs[1].specs[0].entityResults[0].requirementResults, [{ status: 'fail', failureReason: 'LongName chýba' }]);
  });

  it('povinná špecifikácia bez prvku v modeli ostáva nesplnená (bez riadku prvku)', () => {
    const [run] = runsByModel([spec('fail', [])], ['A'], (id) => id);
    assert.equal(run.specs[0].status, 'fail');
    assert.deepEqual(run.specs[0].entityResults, []);
  });

  it('verzia nástroja z balíkov forku; sha256 rovnako ako host', async () => {
    assert.equal(idsEngineVersion([{ name: '@ifc-lite/parser', version: '1' }, { name: '@ifc-lite/ids', version: '3.4.2' }]), '@ifc-lite/ids 3.4.2');
    assert.equal(idsEngineVersion([]), '@ifc-lite/ids');
    assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('texty stavu karty', () => {
    assert.equal(libraryStateText('assigned', { code: 'ER', version: 2 }), 'V projekte ako ER v2');
    assert.match(libraryStateText('collision', { code: 'ER', version: 1 }), /pracovné IDS ER/);
    assert.equal(runStateText({ stale: false, ids_stale: false }), 'aktuálny');
    assert.equal(runStateText({ stale: true, ids_stale: true }), 'zastaraný (novšia revízia modelu, novšia verzia IDS)');
    assert.equal(runStateText({ stale: null, ids_stale: false }), 'revízia neznáma');
  });

  it('správy: žiadosť má zdroj mosta, odpoveď sa overí', () => {
    assert.deepEqual(buildReqlibRequest('r1', 'catalog', {}), { source: 'aim-bridge', type: 'REQLIB_REQUEST', id: 'r1', action: 'catalog', payload: {} });
    assert.equal(isReqlibResult({ source: 'aim-bridge', type: 'REQLIB_RESULT', id: 'r1', ok: true, data: {} }), true);
    assert.equal(isReqlibResult({ source: 'aim-bridge', type: 'REQLIB_RESULT', id: 'r1', ok: 'yes' }), false);
    assert.equal(isReqlibResult({ source: 'iny', type: 'REQLIB_RESULT', id: 'r1', ok: true }), false);
    assert.equal(isReqlibResult({ source: 'aim-bridge', type: 'REQLIB_RESULT', id: '', ok: true }), false);
  });
});
