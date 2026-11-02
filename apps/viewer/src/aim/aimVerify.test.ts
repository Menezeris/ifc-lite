/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { setIdsHostPost } from './idsHost.js';
import { useAimVerify } from './aimVerifyStore.js';
import { forgetVerification, handleVerifyResult, loadVerification, runAllVerification, stopVerify } from './aimVerify.js';

type Sent = { id: string; action: string; payload: Record<string, unknown> };

/** Host, ktorý na každú žiadosť odpovie podľa `answer` (alebo nechá žiadosť visieť, keď vráti undefined). */
function fakeHost(answer: (req: Sent) => { ok: boolean; data?: unknown; error?: string } | undefined) {
  const sent: Sent[] = [];
  setIdsHostPost((msg) => {
    const req = msg as unknown as Sent;
    sent.push(req);
    const a = answer(req);
    if (a) queueMicrotask(() => handleVerifyResult({ source: 'aim-bridge', type: 'VERIFY_RESULT', id: req.id, ...a }));
  });
  return sent;
}

const element = (guid: string, stale: boolean, status = 'green') => ({
  version: 1, global_id: guid, model: 'ASR', revision: stale ? 78 : 79, current_revision: 79, stale, checked_at: '', registry_version: 3,
  targets: [{
    target: 'Qto_SpaceBaseQuantities.Height', status, unit: 'm', file_value: 3.95, computed_value: 3.95, tolerance: { text: '+- 5 mm', abs: 0.005 },
    recipes: [{ recipe: 'space.height.slabs@2', status, explanation: 'x', computed_value: 3.95, cells: [], anchors: [] }],
  }],
});

afterEach(() => {
  stopVerify();
  setIdsHostPost(null);
});

describe('overenie výmer: žiadosti na hosta (AIM D-185 UI)', () => {
  it('uložený beh pre aktuálnu revíziu sa len načíta, prvok sa neoveruje znova', async () => {
    const sent = fakeHost(() => ({ ok: true, data: element('G1', false) }));
    await loadVerification('G1');
    assert.deepEqual(sent.map((s) => [s.action, s.payload.global_id]), [['latest', 'G1']]);
    assert.equal(useAimVerify.getState().status, 'ready');
    assert.equal(useAimVerify.getState().data?.targets[0].status, 'green');
  });

  it('zastaraný alebo chýbajúci beh: host prvok overí teraz (run)', async () => {
    const sent = fakeHost((r) => ({ ok: true, data: r.action === 'latest' ? element('G2', true) : element('G2', false, 'red') }));
    await loadVerification('G2');
    assert.deepEqual(sent.map((s) => s.action), ['latest', 'run']);
    assert.equal(useAimVerify.getState().data?.stale, false);
    assert.equal(useAimVerify.getState().data?.targets[0].status, 'red');

    const none = fakeHost((r) => ({ ok: true, data: r.action === 'latest' ? null : element('G3', false) }));
    await loadVerification('G3');
    assert.deepEqual(none.map((s) => s.action), ['latest', 'run']);
  });

  it('ten istý prvok druhýkrát nežiada; odpoveď pre iný prvok sa zahodí', async () => {
    const sent = fakeHost((r) => ({ ok: true, data: element(r.payload.global_id === 'G4' ? 'OTHER' : 'G5', false) }));
    await loadVerification('G5');
    await loadVerification('G5');
    assert.equal(sent.length, 1);
    await loadVerification('G4');
    // latest vráti iný prvok = nič, preto run; aj ten vráti iný prvok, výsledok ostane prázdny
    assert.equal(useAimVerify.getState().guid, 'G4');
    assert.equal(useAimVerify.getState().data, null);
  });

  it('chyba hosta ostane v stave; bez spojenia sa nič neposiela', async () => {
    fakeHost(() => ({ ok: false, error: 'model nie je načítaný' }));
    await loadVerification('G6');
    assert.equal(useAimVerify.getState().status, 'error');
    assert.equal(useAimVerify.getState().error, 'model nie je načítaný');
    setIdsHostPost(null);
    await loadVerification('G7');
    assert.equal(useAimVerify.getState().error, 'Viewer nie je pripojený k AIM.');
    forgetVerification();
    assert.equal(useAimVerify.getState().guid, null);
  });

  it('ribbon: beh celého modelu so súhrnom, potom znova načíta vybraný prvok', async () => {
    const sent = fakeHost((r) => ({ ok: true, data: r.action === 'run_all'
      ? { check: 'space_quantities', elements: 54, counts: { green: 300, yellow: 4, red: 2, grey: 20 } }
      : element('G8', false) }));
    await loadVerification('G8');
    await runAllVerification('space_quantities');
    assert.deepEqual(sent.map((s) => s.action).slice(0, 2), ['latest', 'run_all']);
    assert.deepEqual(sent[1].payload, { check: 'space_quantities' });
    const run = useAimVerify.getState().runAll;
    assert.equal(run?.busy, false);
    assert.equal(run?.result?.elements, 54);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(sent.at(-1)?.action, 'latest', 'po behu sa vybraný prvok načíta znova');
  });
});
