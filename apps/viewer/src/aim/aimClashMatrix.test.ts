/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { buildMatrix } from './aimClashMatrix.js';
import { cellOf, clearClashCell, inCell, toggleClashCell, useClashCell } from './clashCellFilter.js';
import { describeClash, pairKey, type ClashRich } from './aimClashPlan.js';

const label = (id: string) => ({ m1: 'ASR', m2: 'VZT' }[id] ?? id);
const c = (a: string, ma: string, b: string, mb: string, over: Partial<ClashRich> = {}): ClashRich => ({
  rule: 'r', status: 'hard', severity: 'major', distance: -0.01, a: { key: a, model: ma, tag: 'IfcWall' }, b: { key: b, model: mb, tag: 'IfcDuctSegment' }, ...over,
});
const none = () => undefined;

describe('matica disciplín kolízií (#302)', () => {
  it('ASR x VZT a VZT x ASR sú jedna bunka, VZT x VZT je iná', () => {
    const m = buildMatrix('r', [c('1', 'm1', '2', 'm2'), c('3', 'm2', '4', 'm1'), c('5', 'm2', '6', 'm2')], label, none);
    assert.deepEqual(m.models, ['ASR', 'VZT']);
    assert.deepEqual(m.cells.map((x) => [x.a, x.b, x.total]), [['ASR', 'VZT', 2], ['VZT', 'VZT', 1]]);
  });

  it('počíta druh, stav kontroly (predvolene open) a vynecháva dotyk a cudzie pravidlo', () => {
    const rows = [c('1', 'm1', '2', 'm2'), c('3', 'm1', '4', 'm2', { status: 'clearance' }), c('5', 'm1', '6', 'm2'), c('7', 'm1', '8', 'm2', { status: 'touch' }), c('9', 'm1', '10', 'm2', { rule: 'iné' })];
    const review = (k: string) => (k === pairKey('r', '1', '2') ? 'resolved' as const : k === pairKey('r', '3', '4') ? 'accepted' as const : undefined);
    const [cell] = buildMatrix('r', rows, label, review).cells;
    assert.deepEqual(cell, { a: 'ASR', b: 'VZT', total: 3, by_status: { hard: 2, clearance: 1 }, by_review: { open: 1, resolved: 1, accepted: 1 } });
  });

  it('modely sú zoradené podľa štítku, nie podľa poradia výskytu', () => {
    assert.deepEqual(buildMatrix('r', [c('1', 'm2', '2', 'm2'), c('3', 'm1', '4', 'm1')], label, none).models, ['ASR', 'VZT']);
  });

  it('bez kolízií je matica prázdna', () => {
    assert.deepEqual(buildMatrix('r', [], label, none), { models: [], cells: [] });
  });
});

describe('filter podľa bunky', () => {
  beforeEach(() => clearClashCell());

  it('inCell: bez bunky patrí všetko, s bunkou len zhoda v ľubovoľnom poradí', () => {
    assert.equal(inCell(null, 'X', 'Y'), true);
    assert.equal(inCell(cellOf('ASR', 'VZT'), 'VZT', 'ASR'), true);
    assert.equal(inCell(cellOf('ASR', 'VZT'), 'VZT', 'VZT'), false);
  });

  it('klik zapne bunku, druhý klik na tú istú ju vypne, iná bunka ju prepíše', () => {
    toggleClashCell(cellOf('VZT', 'ASR'));
    assert.deepEqual(useClashCell.getState().cell, { a: 'ASR', b: 'VZT' });
    toggleClashCell(cellOf('ASR', 'VZT'));
    assert.equal(useClashCell.getState().cell, null);
    toggleClashCell(cellOf('ASR', 'VZT'));
    toggleClashCell(cellOf('VZT', 'VZT'));
    assert.deepEqual(useClashCell.getState().cell, { a: 'VZT', b: 'VZT' });
  });
});

describe('clash_local.matrix', () => {
  const test = { name: 'T', a: { type: '*' }, mode: 'hard' as const };
  const run = { total: 1, by_status: { hard: 1, clearance: 0 }, by_review: { open: 1, resolved: 0, accepted: 0 } };
  const matrix = buildMatrix('r', [c('1', 'm1', '2', 'm2')], label, none);

  it('je v opise behu aj s aktívnou bunkou', () => {
    const d = describeClash({ test, fromAim: true, dirty: false, run, selected: null, reviews: [], matrix, cell: cellOf('ASR', 'VZT') });
    assert.deepEqual(d?.matrix, { ...matrix, filter: { a: 'ASR', b: 'VZT' } });
    assert.equal((describeClash({ test, fromAim: true, dirty: false, run, selected: null, reviews: [], matrix }) as { matrix: object }).matrix.hasOwnProperty('filter'), false);
  });

  it('bez behu sa matica neposiela', () => {
    assert.equal('matrix' in (describeClash({ test, fromAim: false, dirty: true, run: null, selected: null, reviews: [], matrix }) ?? {}), false);
  });
});
