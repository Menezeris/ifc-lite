/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_LOAD_RESULTS, MAX_SAVE_RESULTS, MAX_SAVE_REVIEWS, parseClashInbound, parseClashSave } from './clash-protocol.js';

const S = 'aim-bridge' as const;
const el = (guid: string, model = 'VZT') => ({ model, guid, type: 'IfcDuctSegment' });
const test = (over: Record<string, unknown> = {}) => ({ code: 'VZT-NOSNE', name: 'VZT x nosné', a: { type: 'IfcDuct*|IfcPipe*', model: 'VZT' }, b: { type: '!IfcSpace', storey: '1NP' }, mode: 'hard', tolerance_mm: 2, ...over });
const result = (over: Record<string, unknown> = {}) => ({ kind: 'hard', severity: 'major', distance: -0.012, a: el('0aaa'), b: el('0bbb', 'ASR'), ...over });
const load = (over: Record<string, unknown> = {}) => ({ source: S, type: 'CLASH_LOAD', test: test(), ...over });

describe('správy o clash z AIM (D-164)', () => {
  it('CLASH_LOAD: test bez behu, s behom a s výsledkami a stavmi', () => {
    assert.equal(parseClashInbound(load())?.type, 'CLASH_LOAD');
    const full = parseClashInbound(load({ run: { id: 'r1' }, results: [result({ review: 'accepted', comment: 'ok' }), result({ review: 'open' })], results_total: 10, results_truncated: true }));
    assert.ok(full && full.type === 'CLASH_LOAD');
    assert.equal(full.type === 'CLASH_LOAD' && full.results?.length, 2);
    assert.equal(full.type === 'CLASH_LOAD' && full.results?.[0]?.review, 'accepted');
    assert.deepEqual(full.type === 'CLASH_LOAD' && full.run, { id: 'r1' });
  });

  it('CLASH_LOAD: neplatný test sa zahodí (kód, režim, odstup, tolerancia, strana)', () => {
    assert.equal(parseClashInbound(load({ test: test({ code: undefined }) })), null);
    assert.equal(parseClashInbound(load({ test: test({ mode: 'soft' }) })), null);
    assert.equal(parseClashInbound(load({ test: test({ mode: 'clearance' }) })), null);
    assert.ok(parseClashInbound(load({ test: test({ mode: 'clearance', clearance_mm: 50 }) })));
    assert.equal(parseClashInbound(load({ test: test({ tolerance_mm: 100_001 }) })), null);
    assert.equal(parseClashInbound(load({ test: test({ a: { type: '' } }) })), null);
    assert.equal(parseClashInbound(load({ test: test({ b: { type: 'IfcWall', model: '' } }) })), null);
    assert.equal(parseClashInbound({ ...load(), source: 'x' }), null);
  });

  it('CLASH_LOAD: neplatný výsledok (stav, GUID, strop) zahodí celú správu', () => {
    assert.equal(parseClashInbound(load({ results: [result({ review: 'fixed' })] })), null);
    assert.equal(parseClashInbound(load({ results: [result({ a: el('') })] })), null);
    assert.equal(parseClashInbound(load({ results: [result({ kind: 'touch' })] })), null);
    // `ok(=== null)`: pri chybe by `equal` vypisovalo celé pole.
    assert.ok(parseClashInbound(load({ results: new Array(MAX_LOAD_RESULTS + 1).fill(result()) })) === null);
    assert.equal(parseClashInbound(load({ results: 'x' })), null);
  });

  it('CLASH_SAVED: úspech s počtami a poznámkami, chyba', () => {
    const ok = parseClashInbound({ source: S, type: 'CLASH_SAVED', ok: true, test_code: 'T', run_id: 'r2', results: 5, reviews: 2, notes: ['predvolený test sa neprepisuje', 7] });
    assert.deepEqual(ok, { source: S, type: 'CLASH_SAVED', ok: true, test_code: 'T', run_id: 'r2', results: 5, reviews: 2, notes: ['predvolený test sa neprepisuje'] });
    assert.deepEqual(parseClashInbound({ source: S, type: 'CLASH_SAVED', ok: false, error: 'ulož v chate' }), { source: S, type: 'CLASH_SAVED', ok: false, error: 'ulož v chate' });
    assert.equal(parseClashInbound({ source: S, type: 'CLASH_SAVED', ok: 'yes' }), null);
    assert.equal(parseClashInbound({ source: S, type: 'CLASH_SAVED', ok: false }), null);
    assert.equal(parseClashInbound({ source: S, type: 'CLASH_SAVE', ok: true }), null);
  });

  it('CLASH_SAVE: test, beh a zmenené stavy; prázdna správa alebo zlý riadok neplatí', () => {
    assert.ok(parseClashSave({ test: test() }));
    assert.ok(parseClashSave({ test_code: 'T', run: { results: [result()] }, reviews: [{ a: el('1'), b: el('2'), status: 'resolved', comment: '' }] }));
    assert.equal(parseClashSave({ test_code: 'T' }), null);
    assert.equal(parseClashSave({}), null);
    assert.equal(parseClashSave({ run: { results: [result(), result({ distance: 'x' })] } }), null);
    assert.equal(parseClashSave({ reviews: [{ a: el('1'), b: el('2'), status: 'fixed' }] }), null);
    assert.ok(parseClashSave({ run: { results: new Array(MAX_SAVE_RESULTS + 1).fill(result()) } }) === null);
    assert.ok(parseClashSave({ reviews: new Array(MAX_SAVE_REVIEWS + 1).fill({ a: el('1'), b: el('2'), status: 'open' }) }) === null);
  });
});
