/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRun, buildTest, countStatuses, describeClash, matchRun, pairKey, reviewRows, reviewUpdates, signature,
} from './aimClashPlan.js';

const clash = (rule: string, a: string, b: string, distance = -0.0123) => ({ rule, a: { key: a }, b: { key: b }, distance });
const settings = { name: 'T', selectorA: 'IfcWall', selectorB: 'IfcPipe*', mode: 'hard' as const, tolerance: 0.002, clearance: 0.05 };

describe('clash z AIM: čistá logika (D-164)', () => {
  it('pairKey: poradie dvojice nehrá rolu a zhoduje sa s clashReviewKey', () => {
    assert.equal(pairKey('r1', 'B', 'A'), 'r1 A B');
    assert.equal(pairKey('r1', 'A', 'B'), pairKey('r1', 'B', 'A'));
  });

  it('buildTest: jednotky v mm, odstup len v móde clearance', () => {
    assert.deepEqual(buildTest(settings), { name: 'T', a: 'IfcWall', b: 'IfcPipe*', mode: 'hard', tolerance_mm: 2 });
    assert.deepEqual(buildTest({ ...settings, mode: 'clearance' }), { name: 'T', a: 'IfcWall', b: 'IfcPipe*', mode: 'clearance', tolerance_mm: 2, clearance_mm: 50 });
  });

  it('buildRun: len pravidlo testu, stav z kontrol (inak open), vzdialenosť v mm', () => {
    const run = buildRun('r1', [clash('r1', 'A', 'B'), clash('r2', 'C', 'D'), clash('r1', 'E', 'F')], (key) =>
      key === 'r1 A B' ? { status: 'resolved', comment: 'posunuté' } : undefined);
    assert.deepEqual(run.results, [
      { a_guid: 'A', b_guid: 'B', status: 'resolved', distance_mm: -12.3, comment: 'posunuté' },
      { a_guid: 'E', b_guid: 'F', status: 'open', distance_mm: -12.3 },
    ]);
    assert.equal(run.truncated, undefined);
  });

  it('reviewUpdates: len zmenené stavy, rovnaké sa preskočia', () => {
    const current = (key: string) => (key === 'r1 A B' ? { status: 'accepted' as const } : undefined);
    const updates = reviewUpdates('r1', [
      { a_guid: 'B', b_guid: 'A', status: 'accepted' },
      { a_guid: 'C', b_guid: 'D', status: 'resolved', comment: 'x' },
      { a_guid: 'E', b_guid: 'F', status: 'open' },
    ], current);
    assert.deepEqual(updates, [{ key: 'r1 C D', status: 'resolved', comment: 'x' }]);
  });

  it('countStatuses a matchRun: počty a nájdené či chýbajúce uložené dvojice', () => {
    assert.deepEqual(countStatuses([{ status: 'open' }, { status: 'open' }, { status: 'accepted' }]), { open: 2, resolved: 0, accepted: 1 });
    const expected = [{ a_guid: 'A', b_guid: 'B', status: 'open' as const }, { a_guid: 'X', b_guid: 'Y', status: 'open' as const }];
    assert.deepEqual(matchRun(expected, [clash('r1', 'B', 'A'), clash('r2', 'X', 'Y')], 'r1'), { found: 1, missing: 1 });
  });

  it('reviewRows a signature: upravené sa pozná podľa testu a stavov, nie podľa poradia', () => {
    const reviews = new Map([['r1 A B', { status: 'resolved' as const }], ['r2 C D', { status: 'accepted' as const }], ['r1 E F', { status: 'accepted' as const, comment: 'ok' }]]);
    const rows = reviewRows('r1', reviews);
    assert.equal(rows.length, 2);
    const test = buildTest(settings);
    assert.equal(signature(test, rows), signature(test, [...rows].reverse()));
    assert.notEqual(signature(test, rows), signature({ ...test, tolerance_mm: 3 }, rows));
    assert.notEqual(signature(test, rows), signature(test, rows.slice(1)));
    assert.equal(signature(test, rows), signature({ ...test, clearance_mm: 99 }, rows));
  });

  it('describeClash: nič neotvorené = undefined, inak test, beh a upravené', () => {
    const base = { test: null, name: null, mode: 'hard' as const, tolerance_mm: 2, hasRun: false, running: false, counts: null, total: 0, dirty: false };
    assert.equal(describeClash(base), undefined);
    assert.deepEqual(describeClash({ ...base, test: { id: 'T1', version: 2 }, name: 'T', hasRun: true, counts: { open: 1, resolved: 1, accepted: 0 }, total: 2, dirty: true, missing: 1 }), {
      test: { id: 'T1', version: 2 }, name: 'T', mode: 'hard', tolerance_mm: 2, running: false,
      run: { total: 2, open: 1, resolved: 1, accepted: 0, missing_from_saved: 1 }, edited: true,
    });
  });
});
