/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { summarizeListRun, type ListRunRequest, type ListRunSnapshot } from './aimListRunPlan.js';

const REQ: ListRunRequest = { id: 'l1', name: 'Stĺpy', run: true, started: true };
const IDLE: ListRunSnapshot = { executing: false, error: null, result: null };

describe('beh zoznamu z chatu (AIM D-148)', () => {
  it('bez run: zoznam je len otvorený v builderi', () => {
    assert.deepEqual(summarizeListRun({ ...REQ, run: false, started: false }, IDLE, false), { name: 'Stĺpy', status: 'opened' });
  });

  it('hotovo: výsledok tejto definície a počet riadkov', () => {
    const snap = { ...IDLE, result: { id: 'l1', totalCount: 12 } };
    assert.deepEqual(summarizeListRun(REQ, snap, false), { name: 'Stĺpy', status: 'done', rows: 12 });
  });

  it('cudzí výsledok (iný beh) nie je náš: čaká, po vypršaní beží', () => {
    const snap = { ...IDLE, result: { id: 'iny', totalCount: 3 } };
    assert.equal(summarizeListRun(REQ, snap, false), null);
    assert.equal(summarizeListRun(REQ, snap, true)?.status, 'running');
  });

  it('beží, kým trvá výpočet, aj keď je starý výsledok tej istej definície', () => {
    const snap = { executing: true, error: null, result: { id: 'l1', totalCount: 1 } };
    assert.equal(summarizeListRun(REQ, snap, false), null);
    assert.equal(summarizeListRun(REQ, snap, true)?.status, 'running');
  });

  it('chyba výpočtu sa hlási hneď', () => {
    assert.deepEqual(summarizeListRun(REQ, { ...IDLE, error: 'zlý regex' }, false), { name: 'Stĺpy', status: 'failed', error: 'zlý regex' });
  });

  it('hook ešte nespustil: čaká, po vypršaní not_started s dôvodom', () => {
    const waiting = { ...REQ, started: false };
    assert.equal(summarizeListRun(waiting, IDLE, false), null);
    const out = summarizeListRun(waiting, IDLE, true);
    assert.equal(out?.status, 'not_started');
    assert.match(out?.reason ?? '', /model|panel/);
  });

});
