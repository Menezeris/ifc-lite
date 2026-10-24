/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_CLASH_RESULTS, isClashInbound } from './clash-protocol.js';

const S = 'aim-bridge' as const;
const test = (over: Record<string, unknown> = {}) => ({ name: 'VZT x konštrukcie', a: 'IfcDuctSegment|IfcPipeSegment', b: '!IfcSpace', mode: 'hard', tolerance_mm: 2, ...over });
const load = (over: Record<string, unknown> = {}) => ({ source: S, type: 'CLASH_LOAD', test: test(), ...over });
const result = (over: Record<string, unknown> = {}) => ({ a_guid: '0aaa', b_guid: '0bbb', status: 'open', ...over });

describe('správy o clash z AIM (D-164)', () => {
  it('CLASH_LOAD: test bez behu, s behom a s run_now', () => {
    assert.ok(isClashInbound(load()));
    assert.ok(isClashInbound(load({ test: test({ id: 'T1', version: 3, mode: 'clearance', clearance_mm: 50 }) })));
    assert.ok(isClashInbound(load({ run: { results: [result(), result({ status: 'accepted', distance_mm: -12.5, comment: 'ok' })] }, run_now: false })));
  });

  it('CLASH_LOAD: neplatný test (selektor, režim, tolerancia, verzia) sa zahodí', () => {
    assert.ok(!isClashInbound(load({ test: test({ a: '' }) })));
    assert.ok(!isClashInbound(load({ test: test({ b: undefined }) })));
    assert.ok(!isClashInbound(load({ test: test({ mode: 'soft' }) })));
    assert.ok(!isClashInbound(load({ test: test({ tolerance_mm: -1 }) })));
    assert.ok(!isClashInbound(load({ test: test({ tolerance_mm: 1001 }) })));
    assert.ok(!isClashInbound(load({ test: test({ clearance_mm: 5001 }) })));
    assert.ok(!isClashInbound(load({ test: test({ version: 0 }) })));
    assert.ok(!isClashInbound(load({ test: undefined })));
    assert.ok(!isClashInbound({ ...load(), source: 'x' }));
  });

  it('CLASH_LOAD: neplatný beh (stav, GUID, strop) sa zahodí', () => {
    assert.ok(!isClashInbound(load({ run: { results: [result({ status: 'fixed' })] } })));
    assert.ok(!isClashInbound(load({ run: { results: [result({ a_guid: '' })] } })));
    assert.ok(!isClashInbound(load({ run: { results: new Array(MAX_CLASH_RESULTS + 1).fill(result()) } })));
    assert.ok(!isClashInbound(load({ run: { results: 'x' } })));
    assert.ok(!isClashInbound(load({ run_now: 'áno' })));
  });

  it('CLASH_SAVED: úspech, konflikt a chyba', () => {
    assert.ok(isClashInbound({ source: S, type: 'CLASH_SAVED', ok: true, id: 'T1', version: 2 }));
    assert.ok(isClashInbound({ source: S, type: 'CLASH_SAVED', ok: false, latest_version: 4, error: 'conflict' }));
    assert.ok(!isClashInbound({ source: S, type: 'CLASH_SAVED', ok: 'yes' }));
    assert.ok(!isClashInbound({ source: S, type: 'CLASH_SAVED', ok: true, version: 0 }));
    assert.ok(!isClashInbound({ source: S, type: 'CLASH_SAVE', ok: true }));
  });
});
