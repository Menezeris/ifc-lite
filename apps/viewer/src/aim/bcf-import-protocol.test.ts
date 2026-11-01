/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { MAX_BCF_IMPORT_BYTES, MAX_IMPORT_ERRORS, checkImportFile, parseBcfImported } from './bcf-import-protocol.js';
import { handleBcfImported, sendBcfImport } from './aimBcfImport.js';
import { setIdsHostPost } from './idsHost.js';

const S = 'aim-bridge' as const;
const ok = (over: Record<string, unknown> = {}) => ({ source: S, type: 'BCF_IMPORTED', requestId: 'r1', ok: true, created: 2, unchanged: 1, updated: 0, ...over });

describe('import .bcfzip do AIM: tvar správ', () => {
  it('BCF_IMPORTED: počty a chyby', () => {
    const m = parseBcfImported(ok({ errors: ['topic x: bad guid'] }));
    assert.ok(m && m.ok);
    assert.deepEqual(m.ok && [m.created, m.unchanged, m.updated, m.errors], [2, 1, 0, ['topic x: bad guid']]);
    assert.deepEqual(parseBcfImported(ok()) && (parseBcfImported(ok()) as { errors: string[] }).errors, []);
  });

  it('BCF_IMPORTED: chyba hosta', () => {
    const m = parseBcfImported({ source: S, type: 'BCF_IMPORTED', requestId: 'r1', ok: false, error: 'forbidden' });
    assert.deepEqual(m && !m.ok && m.error, 'forbidden');
  });

  it('BCF_IMPORTED: neplatný tvar sa zahodí', () => {
    assert.equal(parseBcfImported(ok({ source: 'x' })), null);
    assert.equal(parseBcfImported(ok({ requestId: '' })), null);
    assert.equal(parseBcfImported(ok({ created: -1 })), null);
    assert.equal(parseBcfImported(ok({ updated: 1.5 })), null);
    assert.equal(parseBcfImported(ok({ errors: [1] })), null);
    assert.equal(parseBcfImported(ok({ ok: undefined })), null);
    assert.equal(parseBcfImported({ source: S, type: 'BCF_IMPORTED', requestId: 'r1', ok: false }), null);
    assert.equal(parseBcfImported(null), null);
  });

  it('BCF_IMPORTED: viac chýb ako strop sa orezá', () => {
    const m = parseBcfImported(ok({ errors: Array.from({ length: MAX_IMPORT_ERRORS + 5 }, (_, i) => `e${i}`) }));
    assert.equal(m && m.ok && m.errors.length, MAX_IMPORT_ERRORS);
  });

  it('súbor: prípona, prázdny, nad strop', () => {
    assert.equal(checkImportFile('a.bcfzip', 10), null);
    assert.equal(checkImportFile('A.BCF', 10), null);
    assert.equal(checkImportFile('a.zip', 10), 'extension');
    assert.equal(checkImportFile('a.bcfzip', 0), 'empty');
    assert.equal(checkImportFile('a.bcfzip', MAX_BCF_IMPORT_BYTES), null);
    assert.equal(checkImportFile('a.bcfzip', MAX_BCF_IMPORT_BYTES + 1), 'tooLarge');
  });
});

describe('import .bcfzip do AIM: odoslanie a odpoveď', () => {
  afterEach(() => setIdsHostPost(null));
  const file = (name = 'a.bcfzip') => ({ name, size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer });

  it('bez mosta sa nič neodošle', async () => {
    assert.deepEqual(await sendBcfImport(file()), { kind: 'invalid', reason: 'notConnected' });
  });

  it('neplatný súbor sa neodošle', async () => {
    const sent: unknown[] = [];
    setIdsHostPost((m) => sent.push(m));
    assert.deepEqual(await sendBcfImport(file('a.txt')), { kind: 'invalid', reason: 'extension' });
    assert.equal(sent.length, 0);
  });

  it('pošle BCF_IMPORT a vyrieši sa odpoveďou s rovnakým requestId; cudzie id sa ignoruje', async () => {
    const sent: Array<Record<string, unknown>> = [];
    setIdsHostPost((m) => sent.push(m));
    const p = sendBcfImport(file());
    await Promise.resolve(); await Promise.resolve();
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.type, 'BCF_IMPORT');
    assert.equal(sent[0]!.filename, 'a.bcfzip');
    assert.equal((sent[0]!.bytes as ArrayBuffer).byteLength, 4);
    assert.deepEqual(await sendBcfImport(file()), { kind: 'invalid', reason: 'busy' });
    handleBcfImported(ok({ requestId: 'other' }));
    handleBcfImported(ok({ requestId: sent[0]!.requestId, created: 3 }));
    assert.deepEqual(await p, { kind: 'done', created: 3, unchanged: 1, updated: 0, errors: [] });
  });

  it('chyba hosta sa vráti ako rejected', async () => {
    const sent: Array<Record<string, unknown>> = [];
    setIdsHostPost((m) => sent.push(m));
    const p = sendBcfImport(file());
    await Promise.resolve(); await Promise.resolve();
    handleBcfImported({ source: S, type: 'BCF_IMPORTED', requestId: sent[0]!.requestId, ok: false, error: 'rate limit' });
    assert.deepEqual(await p, { kind: 'rejected', error: 'rate limit' });
  });
});
