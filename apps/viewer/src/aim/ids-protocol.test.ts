/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_IDS_XML, isIdsInbound } from './ids-protocol.js';

const S = 'aim-bridge' as const;
const load = (over: Record<string, unknown> = {}) => ({ source: S, type: 'IDS_LOAD', code: 'DEMO_MIESTNOSTI', version: 2, xml: '<ids/>', target: 'validation', ...over });

describe('správy o IDS z AIM (D-162)', () => {
  it('IDS_LOAD: platná správa s voliteľným spec a run, oba panely', () => {
    assert.ok(isIdsInbound(load()));
    assert.ok(isIdsInbound(load({ target: 'studio' })));
    assert.ok(isIdsInbound(load({ spec: 'IU-O-space', run: true, title: 'Miestnosti' })));
  });

  it('IDS_LOAD: neplatný cieľ, verzia, kód alebo XML sa zahodí', () => {
    assert.ok(!isIdsInbound(load({ target: 'both' })));
    assert.ok(!isIdsInbound(load({ version: 0 })));
    assert.ok(!isIdsInbound(load({ version: 1.5 })));
    assert.ok(!isIdsInbound(load({ code: '' })));
    assert.ok(!isIdsInbound(load({ xml: '' })));
    assert.ok(!isIdsInbound(load({ xml: 'x'.repeat(MAX_IDS_XML + 1) })));
    assert.ok(!isIdsInbound(load({ run: 'áno' })));
    assert.ok(!isIdsInbound({ ...load(), source: 'x' }));
  });

  it('IDS_SAVED: úspech aj konflikt s poslednou verziou', () => {
    assert.ok(isIdsInbound({ source: S, type: 'IDS_SAVED', target: 'studio', ok: true, code: 'A', version: 3 }));
    assert.ok(isIdsInbound({ source: S, type: 'IDS_SAVED', target: 'validation', ok: false, error: 'konflikt', latest_version: 4 }));
    assert.ok(!isIdsInbound({ source: S, type: 'IDS_SAVED', target: 'studio' }));
    assert.ok(!isIdsInbound({ source: S, type: 'IDS_SAVED', target: 'x', ok: true }));
    assert.ok(!isIdsInbound({ source: S, type: 'IDS_SAVED', target: 'studio', ok: true, version: 0 }));
  });
});
