/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Odpojenie mosta knižnice požiadaviek (AIM D-182): čakajúca žiadosť zlyhá a stav starého spojenia neprežije. */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { loadCatalog, stopReqlib, useAimReqlib } from './aimReqlib.js';
import { setIdsHostPost } from './idsHost.js';

const CHOICE = { path: 'ids/A.ids', commit: 'c1', sha256: 'h1', code: 'A', candidates: ['B'], message: 'Kód sa zmenil.' };

describe('stopReqlib', () => {
  afterEach(() => {
    setIdsHostPost(null);
    useAimReqlib.setState({ data: null, loading: false, error: null, busy: null, notice: null, choice: null });
  });

  it('zahodí otvorenú voľbu priradenia a čakajúca žiadosť skončí chybou', async () => {
    const sent: Array<Record<string, unknown>> = [];
    setIdsHostPost((m) => sent.push(m));
    useAimReqlib.setState({ choice: CHOICE, busy: 'ids/A.ids', notice: { kind: 'ok', text: 'Priradené.' } });
    const loading = loadCatalog();
    assert.equal(sent.length, 1);

    stopReqlib();
    await loading;

    const s = useAimReqlib.getState();
    assert.equal(s.choice, null);
    assert.equal(s.busy, null);
    assert.equal(s.notice, null);
    assert.equal(s.loading, false);
    assert.equal(s.error, 'Spojenie s AIM sa prerušilo; obnov knižnicu.');
  });

  it('zahodí katalóg starého spojenia aj bez čakajúcej žiadosti', () => {
    useAimReqlib.setState({ data: { library: { configured: true, commit: 'c1', items: [] } }, notice: { kind: 'error', text: 'x' } });
    stopReqlib();
    const s = useAimReqlib.getState();
    assert.equal(s.data, null);
    assert.equal(s.notice, null);
    assert.equal(s.error, 'Spojenie s AIM sa prerušilo; obnov knižnicu.');
  });
});
