/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assignOutcome, idsEngineVersion, libraryBrowserHref, libraryStateText, runStateText, runsByModel, saveRunOutcome, sha256Hex, type ReportSpecLike } from './reqlibPlan.js';
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

  it('prvok bez modelu: pri jedinom modeli patrí jemu, pri viacerých sa výsledok neuloží', () => {
    const untagged = [spec('fail', [{ globalId: 'G1', passed: false, requirementResults: [{ status: 'fail', failureReason: 'x' }] }])];
    const [only] = runsByModel(untagged, ['A'], (id) => id);
    assert.equal(only.specs[0].applicableCount, 1);
    assert.equal(only.specs[0].status, 'fail');
    assert.throws(() => runsByModel(untagged, ['A', 'B'], (id) => id), /bez modelu/);
  });

  it('odpoveď hosta na priradenie: známy stav je úspech, prázdna alebo neúplná odpoveď je chyba', () => {
    assert.deepEqual(assignOutcome({ status: 'created', code: 'ER', version: 1 }), { kind: 'ok', text: 'Priradené k projektu ako ER v1.' });
    assert.deepEqual(assignOutcome({ status: 'new_version', code: 'ER2', version: 2, renamed_from: 'ER' }), { kind: 'ok', text: 'Nová verzia ER2 v2 (predtým ER).' });
    assert.deepEqual(assignOutcome({ status: 'choice_required', code: 'ER2', candidates: ['ER', 3], message: 'm' }), { kind: 'choice', code: 'ER2', candidates: ['ER'], message: 'm' });
    assert.equal(assignOutcome({}).kind, 'error');
    assert.equal(assignOutcome(null).kind, 'error');
    assert.equal(assignOutcome({ status: 'created' }).kind, 'error');
    assert.equal(assignOutcome({ ok: true, status: 'iný' }).kind, 'error');
    assert.equal(assignOutcome({ status: 'created', code: 'ER', version: Number.NaN }).kind, 'error');
  });

  it('odpoveď hosta na uloženie výsledku: úspech len so zoznamom uložených modelov', () => {
    assert.deepEqual(saveRunOutcome({ saved: [{ model: 'ASR', revision: 79 }] }), { ok: true, text: 'Výsledok uložený do AIM (ASR v79).' });
    assert.equal(saveRunOutcome({ saved: [{ model: 'ASR', revision: Number.NaN }] }).ok, false);
    assert.equal(saveRunOutcome({ saved: [{ model: 'ASR', revision: 0 }] }).ok, true);
    assert.equal(saveRunOutcome({ saved: [{ model: 'ASR', revision: -1 }] }).ok, false);
    assert.deepEqual(saveRunOutcome({ saved: [{ model: 'ASR', revision: 78, warning: 'stará revízia' }] }), { ok: true, text: 'Výsledok uložený do AIM (ASR v78). stará revízia' });
    assert.equal(saveRunOutcome({ saved: [] }).ok, false);
    assert.equal(saveRunOutcome({}).ok, false);
    assert.equal(saveRunOutcome(undefined).ok, false);
    assert.equal(saveRunOutcome({ saved: [{ model: 'ASR' }] }).ok, false);
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

  it('adresa prehliadača knižnice: celý, alebo priamo poznámka položky z DB', () => {
    assert.equal(libraryBrowserHref(), '/kniznica');
    assert.equal(libraryBrowserHref({ path: 'ids/A.ids', release: { library: null } }), '/kniznica');
    assert.equal(libraryBrowserHref({ path: null, release: { library: 'assetin' } }), '/kniznica');
    assert.equal(
      libraryBrowserHref({ path: 'zadanie/ER/ER-0101 Priestorový model & protokol.md', release: { library: 'assetin' } }),
      '/kniznica?kniznica=assetin&cesta=zadanie%2FER%2FER-0101%20Priestorov%C3%BD%20model%20%26%20protokol.md',
    );
  });
});
