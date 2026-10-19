/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createCommandGate, noteIssue, resetCommandState, settled, takeIssues, track } from './command-gate.js';
import { isCommandMessage, nextIsolation } from './command-protocol.js';

const S = 'aim-bridge';
const G = '27hbQtAoP6qvoEYhPARoI7';

describe('createCommandGate (AIM D-101)', () => {
  it('pred pripravenosťou príkazy radí a po nej ich vykoná v poradí', () => {
    let ready = false;
    const done: number[] = [];
    const gate = createCommandGate(() => ready);
    gate.run(() => done.push(1));
    gate.run(() => done.push(2));
    assert.strictEqual(done.length, 0);
    assert.strictEqual(gate.queued, 2);
    gate.flush();
    assert.strictEqual(done.length, 0);
    ready = true;
    gate.flush();
    assert.deepStrictEqual(done, [1, 2]);
    gate.run(() => done.push(3));
    assert.deepStrictEqual(done, [1, 2, 3]);
  });

  it('nový príkaz nepredbehne zaradené, aj keď je brána už pripravená', () => {
    let ready = false;
    const done: string[] = [];
    const gate = createCommandGate(() => ready);
    gate.run(() => done.push('rez'));
    ready = true;
    gate.run(() => done.push('potvrdenie'));
    assert.strictEqual(done.length, 0);
    gate.flush();
    assert.deepStrictEqual(done, ['rez', 'potvrdenie']);
  });
});

describe('settled / issues (AIM D-101)', () => {
  it('počká na sledovaný krok aj na ten, ktorý pribudne počas čakania', async () => {
    let order: string[] = [];
    track(new Promise<void>((r) => setTimeout(() => {
      order.push('rez');
      track(new Promise<void>((r2) => setTimeout(() => { order.push('kamera'); r2(); }, 5)));
      r();
    }, 5)));
    assert.strictEqual(await settled(1000), true);
    assert.deepStrictEqual(order, ['rez', 'kamera']);
    order = [];
  });

  it('vypršaný čas vráti false; chyba kroku sa zapíše ako problém', async () => {
    track(new Promise(() => {}));
    assert.strictEqual(await settled(20), false);
    track(Promise.reject(new Error('lens neprešla')));
    noteIssue('FOCUS: vo vieweri sa nenašiel žiadny prvok');
    await new Promise((r) => setTimeout(r, 0));
    const issues = takeIssues();
    assert.ok(issues.includes('lens neprešla'));
    assert.ok(issues.includes('FOCUS: vo vieweri sa nenašiel žiadny prvok'));
    assert.deepStrictEqual(takeIssues(), []);
  });
});

describe('resetCommandState (AIM D-101)', () => {
  it('odpojenie mosta zabudne problémy aj visiace kroky predošlej relácie', async () => {
    noteIssue('stará relácia');
    track(new Promise(() => {}));
    resetCommandState();
    assert.deepStrictEqual(takeIssues(), []);
    assert.strictEqual(await settled(20), true);
  });

  it('krok predošlej relácie, ktorý zlyhá až po odpojení, problém do novej nezapíše', async () => {
    let fail!: (e: Error) => void;
    track(new Promise((_, reject) => (fail = reject)));
    resetCommandState();
    fail(new Error('starý rez'));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual(takeIssues(), []);
  });
});

describe('command-protocol (AIM D-101)', () => {
  it('prijme potvrdenie, zrušenie zvýraznenia a zmeny izolácie', () => {
    for (const msg of [
      { source: S, type: 'ACK_REQUEST', cmdId: 'c-1' },
      { source: S, type: 'CLEAR_FOCUS' },
      { source: S, type: 'ISOLATE_ADD', guids: [G] },
      { source: S, type: 'ISOLATE_REMOVE', selector: { types: ['IfcStair'] } },
    ]) assert.strictEqual(isCommandMessage(msg), true, JSON.stringify(msg));
  });

  it('odmietne cudzí zdroj, chýbajúce id a izoláciu bez cieľa', () => {
    for (const msg of [
      { source: 'x', type: 'CLEAR_FOCUS' },
      { source: S, type: 'ACK_REQUEST' },
      { source: S, type: 'ACK_REQUEST', cmdId: 'x'.repeat(65) },
      { source: S, type: 'ISOLATE_ADD' },
      { source: S, type: 'ISOLATE_REMOVE', guids: 'G' },
      { source: S, type: 'FOCUS', guids: [G] },
    ]) assert.strictEqual(isCommandMessage(msg), false, JSON.stringify(msg));
  });

  it('nextIsolation: pridanie zjednotí, odobratie odčíta, bez izolácie pridanie začne novú', () => {
    assert.deepStrictEqual(nextIsolation(new Set([1, 2]), [2, 3], 'add'), [1, 2, 3]);
    assert.deepStrictEqual(nextIsolation(new Set([1, 2, 3]), [2], 'remove'), [1, 3]);
    assert.deepStrictEqual(nextIsolation(null, [4], 'add'), [4]);
    assert.deepStrictEqual(nextIsolation(null, [4], 'remove'), []);
  });
});
