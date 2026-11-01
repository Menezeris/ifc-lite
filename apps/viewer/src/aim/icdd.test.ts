/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SOURCE } from './bridge-core.js';
import { buildCheckRequest, buildExportRequest, isIcddStatusMessage } from './icdd-protocol.js';
import { applyStatus, applyTimeout, firstLines, ICDD_HOST_TIMEOUT_MS, ICDD_NO_HOST, isBusy, startRun, summarize } from './icddPlan.js';

const exportResult = { filename: 'a.icdd', payloads: 3, links: 7, size_bytes: 2048, ok: true, errors: [], warnings: [], skipped: [] };
const checkResult = { ok: true, errors: [], same: true, links_only_in_container: 0, links_only_in_aim: 0, payloads_changed: 0, version_id: 'v1' };
const status = (o: Record<string, unknown>) => ({ source: SOURCE, type: 'ICDD_STATUS', id: 'x', op: 'export', phase: 'running', message: 'beží', ...o });

describe('správy ICDD (D-181)', () => {
  it('žiadosti majú tvar zo špecifikácie', () => {
    assert.deepEqual(buildExportRequest('1'), { source: SOURCE, type: 'ICDD_EXPORT', id: '1' });
    const bytes = new ArrayBuffer(4);
    const c = buildCheckRequest('2', 'k.icdd', bytes);
    assert.equal(c.type, 'ICDD_CHECK');
    assert.equal(c.name, 'k.icdd');
    assert.equal(c.bytes, bytes);
  });

  it('stav: overí op, fázu a tvar výsledku podľa op', () => {
    assert.equal(isIcddStatusMessage(status({})), true);
    assert.equal(isIcddStatusMessage(status({ phase: 'done', result: exportResult })), true);
    assert.equal(isIcddStatusMessage(status({ op: 'check', phase: 'done', result: checkResult })), true);
    assert.equal(isIcddStatusMessage(status({ op: 'check', phase: 'done', result: exportResult })), false);
    assert.equal(isIcddStatusMessage(status({ phase: 'done', result: checkResult })), false);
    assert.equal(isIcddStatusMessage(status({ op: 'zip' })), false);
    assert.equal(isIcddStatusMessage(status({ phase: 'hotovo' })), false);
    assert.equal(isIcddStatusMessage(status({ id: '' })), false);
    assert.equal(isIcddStatusMessage(status({ source: 'iny' })), false);
    assert.equal(isIcddStatusMessage(status({ phase: 'done', result: { ...exportResult, errors: [1] } })), false);
  });
});

describe('priebeh behu ICDD', () => {
  it('prvý stav hosta prepíše čakanie, koncový stav sa už nemení', () => {
    const run = startRun('x', 'export');
    assert.equal(isBusy(run), true);
    const running = applyStatus(run, status({}) as never)!;
    assert.equal(running.phase, 'running');
    assert.equal(running.message, 'beží');
    const done = applyStatus(running, status({ phase: 'done', message: 'hotovo', result: exportResult }) as never)!;
    assert.equal(done.phase, 'done');
    assert.equal(isBusy(done), false);
    assert.equal(applyStatus(done, status({ phase: 'running' }) as never), done);
  });

  it('stav iného behu alebo inej operácie sa ignoruje', () => {
    const run = startRun('x', 'export');
    assert.equal(applyStatus(run, status({ id: 'y' }) as never), run);
    assert.equal(applyStatus(run, status({ op: 'check' }) as never), run);
    assert.equal(applyStatus(null, status({}) as never), null);
  });

  it('starší host: bez stavu do 5 s je to "host nepodporuje ICDD"', () => {
    assert.equal(ICDD_HOST_TIMEOUT_MS, 5000);
    const run = startRun('x', 'check');
    const out = applyTimeout(run, 'x')!;
    assert.equal(out.phase, 'error');
    assert.equal(out.message, ICDD_NO_HOST);
  });

  it('limit nepreváži beh, ktorý už host potvrdil, ani iný beh', () => {
    const running = applyStatus(startRun('x', 'export'), status({}) as never)!;
    assert.equal(applyTimeout(running, 'x'), running);
    const waiting = startRun('x', 'export');
    assert.equal(applyTimeout(waiting, 'iny'), waiting);
  });
});

describe('text výsledku', () => {
  it('export: názov, veľkosť, počty a prvé chyby so zvyškom', () => {
    const errors = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
    const run = { ...startRun('x', 'export'), phase: 'done' as const, message: '', result: { ...exportResult, ok: false, errors, warnings: ['w'], skipped: ['s1', 's2'] } };
    const s = summarize(run);
    assert.equal(s.ok, false);
    assert.equal(s.title, 'ICDD exportované s chybami');
    assert.deepEqual(s.lines, ['a.icdd (2 kB)', 'Obsah: 3, prepojenia: 7', 'Upozornení: 1', 'Vynechané: 2']);
    assert.deepEqual(s.errors, ['e1', 'e2', 'e3', 'e4', 'e5', '... a ďalších 2']);
  });

  it('kontrola: zhoda ukáže len zhodu, rozdiel ukáže počty a verziu', () => {
    const base = { ...startRun('x', 'check'), phase: 'done' as const, message: '' };
    assert.deepEqual(summarize({ ...base, result: checkResult }).lines, ['Kontajner sa zhoduje s AIM', 'Verzia: v1']);
    const diff = summarize({ ...base, result: { ...checkResult, same: false, links_only_in_aim: 2, payloads_changed: 1 } });
    assert.equal(diff.ok, false);
    assert.deepEqual(diff.lines.slice(0, 4), ['Kontajner sa líši od AIM', 'Prepojenia len v kontajneri: 0', 'Prepojenia len v AIM: 2', 'Zmenený obsah: 1']);
  });

  it('done bez výsledku nie je úspech (export aj kontrola)', () => {
    for (const op of ['export', 'check'] as const) {
      const s = summarize({ ...startRun('x', op), phase: 'done' as const, message: 'hotovo' });
      assert.equal(s.ok, false, op);
      assert.match(s.title, /bez výsledku/, op);
      assert.deepEqual(s.lines, ['hotovo'], op);
      assert.deepEqual(s.errors, [], op);
    }
  });

  it('beh bez výsledku, ktorý ešte nie je hotový, nie je úspech', () => {
    for (const phase of ['waiting', 'running'] as const) {
      assert.equal(summarize({ ...startRun('x', 'export'), phase, message: 'beží' }).ok, false, phase);
      assert.equal(summarize({ ...startRun('x', 'check'), phase, message: 'beží' }).ok, false, phase);
    }
  });

  it('verzia: prázdny reťazec sa ukáže, null a chýbajúca sa vynechá', () => {
    const base = { ...startRun('x', 'check'), phase: 'done' as const, message: '' };
    assert.deepEqual(summarize({ ...base, result: { ...checkResult, version_id: '' } }).lines, ['Kontajner sa zhoduje s AIM', 'Verzia: (prázdna)']);
    assert.deepEqual(summarize({ ...base, result: { ...checkResult, version_id: null } }).lines, ['Kontajner sa zhoduje s AIM']);
    const { version_id: _omit, ...withoutVersion } = checkResult;
    assert.deepEqual(summarize({ ...base, result: withoutVersion as never }).lines, ['Kontajner sa zhoduje s AIM']);
  });

  it('chyba hosta ukáže jeho správu', () => {
    const s = summarize({ ...startRun('x', 'check'), phase: 'error', message: 'zlý súbor' });
    assert.equal(s.title, 'Kontrola ICDD zlyhala');
    assert.deepEqual(s.lines, ['zlý súbor']);
  });

  it('firstLines nechá krátky zoznam celý', () => {
    assert.deepEqual(firstLines(['a', 'b']), ['a', 'b']);
  });
});
