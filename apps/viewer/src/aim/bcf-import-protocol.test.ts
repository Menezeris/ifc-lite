/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { MAX_BCF_IMPORT_BYTES, MAX_IMPORT_WARNINGS, checkImportFile, parseBcfImported } from './bcf-import-protocol.js';
import { handleBcfImported, sendBcfImport } from './aimBcfImport.js';
import { setIdsHostPost } from './idsHost.js';

const S = 'aim-bridge' as const;
const summary = (over: Record<string, unknown> = {}) => ({ dry_run: true, bcf_version: '2.1', topics_in_file: 4, created: 2, updated: 1, unchanged: 1, conflicts: 0, skipped: 0, failed: 0, warnings: [], ...over });
const ok = (over: Record<string, unknown> = {}, sum: Record<string, unknown> = {}) => ({ type: 'BCF_IMPORTED', id: 'r1', ok: true, summary: summary(sum), ...over });

describe('import .bcfzip do AIM: tvar správ', () => {
  it('BCF_IMPORTED: súhrn so zdrojom aj bez neho', () => {
    const m = parseBcfImported({ ...ok({}, { warnings: ['w1'] }), source: S });
    assert.ok(m && m.ok);
    assert.deepEqual(m.ok && [m.summary.created, m.summary.updated, m.summary.unchanged, m.summary.warnings], [2, 1, 1, ['w1']]);
    assert.ok(parseBcfImported(ok()));
    assert.deepEqual(parseBcfImported(ok({}, { warnings: undefined }))?.ok && (parseBcfImported(ok({}, { warnings: undefined })) as { summary: { warnings: string[] } }).summary.warnings, []);
  });

  it('BCF_IMPORTED: chyba hosta', () => {
    const m = parseBcfImported({ type: 'BCF_IMPORTED', id: 'r1', ok: false, error: 'forbidden' });
    assert.deepEqual(m && !m.ok && m.error, 'forbidden');
  });

  it('BCF_IMPORTED: neplatný tvar sa zahodí', () => {
    assert.equal(parseBcfImported(ok({ source: 'x' })), null);
    assert.equal(parseBcfImported(ok({ id: '' })), null);
    assert.equal(parseBcfImported(ok({ summary: undefined })), null);
    assert.equal(parseBcfImported(ok({}, { created: -1 })), null);
    assert.equal(parseBcfImported(ok({}, { conflicts: 1.5 })), null);
    assert.equal(parseBcfImported(ok({}, { failed: undefined })), null);
    assert.equal(parseBcfImported(ok({}, { dry_run: 'yes' })), null);
    assert.equal(parseBcfImported(ok({}, { warnings: [1] })), null);
    assert.equal(parseBcfImported(ok({ ok: undefined })), null);
    assert.equal(parseBcfImported({ type: 'BCF_IMPORTED', id: 'r1', ok: false }), null);
    assert.equal(parseBcfImported(null), null);
  });

  it('BCF_IMPORTED: viac upozornení ako strop sa orezá', () => {
    const m = parseBcfImported(ok({}, { warnings: Array.from({ length: MAX_IMPORT_WARNINGS + 5 }, (_, i) => `w${i}`) }));
    assert.equal(m && m.ok && m.summary.warnings.length, MAX_IMPORT_WARNINGS);
  });

  it('súbor: prípona, prázdny, strop 4 400 000 B', () => {
    assert.equal(MAX_BCF_IMPORT_BYTES, 4_400_000);
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
  const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

  it('bez mosta sa nič neodošle', async () => {
    assert.deepEqual(await sendBcfImport(file(), true), { kind: 'invalid', reason: 'notConnected' });
  });

  it('neplatný súbor sa neodošle', async () => {
    const sent: unknown[] = [];
    setIdsHostPost((m) => sent.push(m));
    assert.deepEqual(await sendBcfImport(file('a.txt'), true), { kind: 'invalid', reason: 'extension' });
    assert.deepEqual(await sendBcfImport({ ...file(), size: MAX_BCF_IMPORT_BYTES + 1 }, true), { kind: 'invalid', reason: 'tooLarge' });
    assert.equal(sent.length, 0);
  });

  it('pošle BCF_IMPORT s dry_run a vyrieši sa odpoveďou s rovnakým id; cudzie id sa ignoruje', async () => {
    const sent: Array<Record<string, unknown>> = [];
    setIdsHostPost((m) => sent.push(m));
    const p = sendBcfImport(file(), true);
    await tick();
    assert.equal(sent.length, 1);
    assert.deepEqual([sent[0]!.source, sent[0]!.type, sent[0]!.name, sent[0]!.dry_run], [S, 'BCF_IMPORT', 'a.bcfzip', true]);
    assert.equal((sent[0]!.bytes as ArrayBuffer).byteLength, 4);
    assert.deepEqual(await sendBcfImport(file(), true), { kind: 'invalid', reason: 'busy' });
    handleBcfImported(ok({ id: 'other' }));
    handleBcfImported(ok({ id: sent[0]!.id }, { created: 3 }));
    const out = await p;
    assert.ok(out.kind === 'done' && out.summary.created === 3 && out.summary.dry_run === true);
  });

  it('zápis posiela dry_run=false', async () => {
    const sent: Array<Record<string, unknown>> = [];
    setIdsHostPost((m) => sent.push(m));
    const p = sendBcfImport(file(), false);
    await tick();
    assert.equal(sent[0]!.dry_run, false);
    handleBcfImported(ok({ id: sent[0]!.id }, { dry_run: false }));
    assert.equal((await p).kind, 'done');
  });

  it('chyba hosta sa vráti ako rejected', async () => {
    const sent: Array<Record<string, unknown>> = [];
    setIdsHostPost((m) => sent.push(m));
    const p = sendBcfImport(file(), true);
    await tick();
    handleBcfImported({ type: 'BCF_IMPORTED', id: sent[0]!.id, ok: false, error: 'rate limit' });
    assert.deepEqual(await p, { kind: 'rejected', error: 'rate limit' });
  });
});
