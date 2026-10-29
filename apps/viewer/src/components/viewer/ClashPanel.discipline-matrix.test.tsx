/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Filter zoznamu podľa bunky matice disciplín (#302): klik na bunku ASR x VZT nechá v zozname len kolízie medzi
 * týmito modelmi, zrušenie bunky vráti všetky. Panel ju číta z `useClashCell` v bloku AIM-FORK.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Clash, ClashResult } from '@ifc-lite/clash';
import { clashReviewKey } from '@ifc-lite/clash';
import { useViewerStore } from '@/store';
import { ClashPanel } from './ClashPanel.js';
import { clearClashCell, toggleClashCell, cellOf } from '@/aim/clashCellFilter.js';

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 800, configurable: true });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { get: () => 600, configurable: true });

function clash(id: string, tagA: string, modelA: string, modelB: string): Clash {
  return {
    id,
    a: { key: `${id}-a`, ref: 1, model: modelA, tag: tagA },
    b: { key: `${id}-b`, ref: 2, model: modelB, tag: 'IfcColumn' },
    rule: 'hard-clash',
    status: 'hard',
    distance: -0.05,
    point: [0, 0, 0],
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    severity: 'major',
  };
}

function resultOf(clashes: Clash[]): ClashResult {
  return {
    clashes,
    summary: {
      total: clashes.length,
      byRule: { 'hard-clash': clashes.length },
      byTypePair: {},
      bySeverity: { critical: 0, major: clashes.length, minor: 0, info: 0 },
    },
    rulesRun: [{ id: 'hard-clash', name: 'Hard clash', a: 'IfcWall', b: 'IfcBeam', mode: 'hard' }],
    settings: { tolerance: 0.002, excludeVoidsAndHosts: true },
  };
}

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  container = null;
  clearClashCell();
  useViewerStore.setState({ clashResult: null, clashGroups: null, clashReviews: new Map(), models: new Map() });
});

describe('ClashPanel - filter podľa bunky matice disciplín', () => {
  it('klik na bunku nechá len kolízie medzi jej modelmi, druhý klik vráti všetky', async () => {
    const models = new Map([['m1', { id: 'm1', name: 'ASR' }], ['m2', { id: 'm2', name: 'VZT' }]]);
    useViewerStore.setState({
      models: models as unknown as ReturnType<typeof useViewerStore.getState>['models'],
      clashResult: resultOf([clash('x-1', 'IfcWall', 'm1', 'm2'), clash('x-2', 'IfcBeam', 'm2', 'm2')]),
      clashGroups: [],
      clashHideTouching: false,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(<ClashPanel />); });
    const text = () => container!.textContent ?? '';
    assert.ok(text().includes('IfcWall × IfcColumn') && text().includes('IfcBeam × IfcColumn'), 'bez bunky sú vidieť obe');

    await act(async () => { toggleClashCell(cellOf('VZT', 'ASR')); });
    assert.ok(text().includes('IfcWall × IfcColumn'), `ASR x VZT ostáva; got: ${text().slice(0, 400)}`);
    assert.ok(!text().includes('IfcBeam × IfcColumn'), 'VZT x VZT je preč');

    await act(async () => { toggleClashCell(cellOf('ASR', 'VZT')); });
    assert.ok(text().includes('IfcBeam × IfcColumn'), 'druhý klik vráti všetky');
  });
});
