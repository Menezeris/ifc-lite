/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_SAVE_RESULTS, parseClashSave, type ClashElementWire, type ClashResultWire } from './clash-protocol.js';
import {
  buildResults, buildTest, countRun, describeClash, knownPairs, loadUpdates, matchRun, pairKey, reviewChanges, reviewSnapshot, testSignature,
  type ClashRich, type ReviewState,
} from './aimClashPlan.js';

const side = (type: string, extra: Record<string, string> = {}) => ({ type, ...extra });
const input = { name: 'T', a: side('IfcWall'), b: side('IfcPipe*', { model: 'VZT' }), mode: 'hard' as const, tolerance: 0.002, clearance: 0.05 };
const el = (guid: string, model = 'ASR'): ClashElementWire => ({ model, guid });
const clash = (rule: string, a: string, b: string, over: Partial<ClashRich> = {}): ClashRich => ({
  rule, status: 'hard', severity: 'major', distance: -0.012, a: { key: a, model: 'm1', tag: 'IfcWall' }, b: { key: b, model: 'm2', tag: 'IfcPipeSegment' }, ...over,
});
const label = (id: string) => (id === 'm1' ? 'ASR' : id === 'm2' ? 'VZT' : id);
const wire = (a: string, b: string, over: Partial<ClashResultWire> = {}): ClashResultWire => ({ kind: 'hard', severity: 'major', distance: -0.01, a: el(a), b: el(b), ...over });

describe('clash z AIM: čistá logika (D-164)', () => {
  it('pairKey: poradie dvojice nehrá rolu a zhoduje sa s clashReviewKey', () => {
    assert.equal(pairKey('r1', 'B', 'A'), 'r1 A B');
    assert.equal(pairKey('r1', 'A', 'B'), pairKey('r1', 'B', 'A'));
  });

  it('buildTest: jednotky v mm, B sa vynechá pri rovnakej sade, odstup len v móde clearance (aspoň 1 mm)', () => {
    assert.deepEqual(buildTest({ ...input, code: 'C1' }), { code: 'C1', name: 'T', a: { type: 'IfcWall' }, b: { type: 'IfcPipe*', model: 'VZT' }, mode: 'hard', tolerance_mm: 2 });
    assert.deepEqual(buildTest({ ...input, b: input.a }), { name: 'T', a: { type: 'IfcWall' }, mode: 'hard', tolerance_mm: 2 });
    assert.equal(buildTest({ ...input, mode: 'clearance' }).clearance_mm, 50);
    assert.equal(buildTest({ ...input, mode: 'clearance', clearance: 0 }).clearance_mm, 1);
  });

  it('testSignature: názov a kód sa nepočítajú, odstup len v móde clearance, B rovné A je ako chýbajúce', () => {
    const t = buildTest(input);
    assert.equal(testSignature(t), testSignature({ ...t, name: 'iný', code: 'X' }));
    assert.equal(testSignature(t), testSignature({ ...t, clearance_mm: 99 }));
    assert.notEqual(testSignature(t), testSignature({ ...t, tolerance_mm: 3 }));
    assert.notEqual(testSignature(t), testSignature({ ...t, a: { type: 'IfcWall', storey: '1NP' } }));
    const self = buildTest({ ...input, b: input.a });
    assert.equal(testSignature(self), testSignature({ ...self, b: self.a }));
    assert.notEqual(testSignature({ ...t, mode: 'clearance', clearance_mm: 50 }), testSignature({ ...t, mode: 'clearance', clearance_mm: 60 }));
  });

  it('buildResults: len pravidlo testu, bez dotykov, najzávažnejšie prvé, model ako štítok hosta', () => {
    const { results, truncated } = buildResults('r1', [
      clash('r1', 'A', 'B', { severity: 'minor' }), clash('r2', 'C', 'D'), clash('r1', 'E', 'F', { status: 'touch' }),
      clash('r1', 'G', 'H', { severity: 'critical', distance: -0.05 }), clash('r1', 'I', 'J', { severity: 'minor', distance: -0.2, status: 'clearance' }),
    ], label);
    assert.deepEqual(results.map((r) => r.a.guid), ['G', 'I', 'A']);
    assert.deepEqual(results[0], { kind: 'hard', severity: 'critical', distance: -0.05, a: { model: 'ASR', guid: 'G', type: 'IfcWall' }, b: { model: 'VZT', guid: 'H', type: 'IfcPipeSegment' } });
    assert.equal(results[1]!.kind, 'clearance');
    assert.equal(truncated, false);
  });

  it('buildResults: nad stropom hosta sa výsledky orežú a hlási sa truncated', () => {
    const many = Array.from({ length: MAX_SAVE_RESULTS + 1 }, (_, i) => clash('r1', `A${i}`, `B${i}`));
    const run = buildResults('r1', many, label);
    assert.equal(run.results.length, MAX_SAVE_RESULTS);
    assert.equal(run.truncated, true);
  });

  it('správa zo zloženia testu, behu a zmien prejde kontrolou hosta', () => {
    const run = buildResults('r1', [clash('r1', 'A', 'B')], label);
    const known = knownPairs('r1', run.results);
    const { changes } = reviewChanges(new Map([[pairKey('r1', 'A', 'B'), { status: 'accepted' as const }]]), new Map(), known);
    const msg = { test: buildTest({ ...input, mode: 'clearance' }), run: { results: run.results }, reviews: changes };
    assert.ok(parseClashSave(msg));
  });

  it('loadUpdates: len zmenené stavy, rovnaké a výsledky bez stavu sa preskočia', () => {
    const current = (key: string): ReviewState | undefined => (key === 'r1 A B' ? { status: 'accepted' } : undefined);
    const updates = loadUpdates('r1', [
      wire('B', 'A', { review: 'accepted' }), wire('C', 'D', { review: 'resolved', comment: 'x' }), wire('E', 'F', { review: 'open' }), wire('G', 'H'),
    ], current);
    assert.deepEqual(updates, [{ key: 'r1 C D', status: 'resolved', comment: 'x' }]);
  });

  it('reviewSnapshot: len kontroly pravidla', () => {
    const snap = reviewSnapshot('r1', [['r1 A B', { status: 'resolved' }], ['r2 C D', { status: 'accepted' }], ['r1 E F', { status: 'accepted', comment: 'ok' }]]);
    assert.deepEqual([...snap.keys()], ['r1 A B', 'r1 E F']);
  });

  it('reviewChanges: len zmenené dvojice, poznámka len keď sa mení, návrat na open, neznáma dvojica sa nepošle', () => {
    const known = knownPairs('r1', [wire('A', 'B'), wire('C', 'D'), wire('E', 'F'), wire('G', 'H')]);
    const baseline = new Map<string, ReviewState>([['r1 A B', { status: 'resolved' }], ['r1 C D', { status: 'accepted', comment: 'stará' }], ['r1 E F', { status: 'resolved' }]]);
    const current = new Map<string, ReviewState>([
      ['r1 A B', { status: 'resolved' }],
      ['r1 C D', { status: 'accepted', comment: 'nová' }],
      ['r1 G H', { status: 'accepted' }],
      ['r1 X Y', { status: 'resolved' }],
    ]);
    const { changes, skipped } = reviewChanges(current, baseline, known);
    assert.deepEqual(changes, [
      { a: el('C'), b: el('D'), status: 'accepted', comment: 'nová' },
      { a: el('E'), b: el('F'), status: 'open' },
      { a: el('G'), b: el('H'), status: 'accepted' },
    ]);
    assert.equal(skipped, 1);
    assert.deepEqual(reviewChanges(new Map([['r1 C D', { status: 'accepted' as const }]]), new Map([['r1 C D', { status: 'accepted' as const, comment: 'x' }]]), known).changes, [{ a: el('C'), b: el('D'), status: 'accepted', comment: '' }]);
  });

  it('countRun a matchRun: počty podľa druhu a stavu, nájdené a chýbajúce uložené dvojice', () => {
    const clashes = [clash('r1', 'A', 'B'), clash('r1', 'C', 'D', { status: 'clearance' }), clash('r1', 'E', 'F', { status: 'touch' }), clash('r2', 'X', 'Y')];
    const review = (key: string) => (key === 'r1 C D' ? 'accepted' as const : undefined);
    assert.deepEqual(countRun('r1', clashes, review), { total: 2, by_status: { hard: 1, clearance: 1 }, by_review: { open: 1, resolved: 0, accepted: 1 } });
    assert.deepEqual(matchRun([wire('B', 'A'), wire('X', 'Y')], clashes, 'r1'), { found: 1, missing: 1 });
  });

  it('describeClash: bez testu undefined, inak tvar pre hosta', () => {
    const base = { test: null, fromAim: false, dirty: false, run: null, selected: null, reviews: [] };
    assert.equal(describeClash(base), undefined);
    const test = buildTest(input);
    assert.deepEqual(describeClash({ ...base, test }), { test, from_aim: false, dirty: false });
    const counts = { total: 2, by_status: { hard: 2, clearance: 0 }, by_review: { open: 1, resolved: 1, accepted: 0 } };
    assert.deepEqual(describeClash({
      ...base, test, fromAim: true, dirty: true, run: { ...counts, id: 'r9' }, missing: 1,
      selected: { a: { ...el('A'), type: 'IfcWall' }, b: el('B') }, reviews: [{ a: el('A'), b: el('B'), status: 'resolved' }],
    }), {
      test, from_aim: true, dirty: true,
      run: { id: 'r9', ...counts, source: 'local', missing_from_saved: 1 },
      selected: { a: el('A'), b: el('B') }, reviews: [{ a: el('A'), b: el('B'), status: 'resolved' }],
    });
  });
});
