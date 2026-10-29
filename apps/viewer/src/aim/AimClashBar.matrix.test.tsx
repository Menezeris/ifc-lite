/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Matica disciplín v lište panela clash (#302): bunky z výsledkov behu aktívneho presetu, klik zapne filter zoznamu,
 * bunka, ktorá v novom behu nie je, sa zruší.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Clash, ClashResult } from '@ifc-lite/clash';
import { rememberRunRequest } from '@/lib/clash/run-request';
import { useViewerStore } from '@/store';
import AimClashBar from './AimClashBar.js';
import { clearClashCell, useClashCell } from './clashCellFilter.js';

const clash = (id: string, rule: string, ma: string, mb: string): Clash => ({
  id, a: { key: `${id}-a`, ref: 1, model: ma, tag: 'IfcWall' }, b: { key: `${id}-b`, ref: 2, model: mb, tag: 'IfcDuctSegment' },
  rule, status: 'hard', distance: -0.05, point: [0, 0, 0], bounds: { min: [0, 0, 0], max: [1, 1, 1] }, severity: 'major',
});
const resultOf = (presetId: string, clashes: Clash[]): ClashResult => {
  const r = {
    clashes, summary: { total: clashes.length, byRule: {}, byTypePair: {}, bySeverity: { critical: 0, major: clashes.length, minor: 0, info: 0 } },
    rulesRun: [], settings: { tolerance: 0.002, excludeVoidsAndHosts: true },
  } as unknown as ClashResult;
  rememberRunRequest(r, { kind: 'preset', presetId, name: 'T' });
  return r;
};

let root: Root | null = null;
let container: HTMLElement | null = null;
const models = new Map([['m1', { id: 'm1', name: 'ASR' }], ['m2', { id: 'm2', name: 'VZT' }]]) as unknown as ReturnType<typeof useViewerStore.getState>['models'];

async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<AimClashBar runPreset={async () => {}} />); });
}
const buttons = () => [...container!.querySelectorAll<HTMLButtonElement>('[data-testid="aim-clash-matrix"] button')];

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  container = null;
  clearClashCell();
  useViewerStore.setState({ clashRawResult: null, clashResult: null, models: new Map(), clashReviews: new Map() });
});

describe('AimClashBar: matica disciplín', () => {
  it('ukáže bunku na každú dvojicu modelov, klik zapne a druhý klik vypne filter', async () => {
    const preset = useViewerStore.getState().clashPresets[0]!;
    const raw = resultOf(preset.id, [clash('1', preset.id, 'm1', 'm2'), clash('2', preset.id, 'm2', 'm1'), clash('3', preset.id, 'm2', 'm2')]);
    useViewerStore.setState({ models, clashRawResult: raw, clashResult: raw });
    await render();
    assert.deepEqual(buttons().map((b) => b.textContent), ['ASR x VZT: 2 (2/0/0)', 'VZT x VZT: 1 (1/0/0)']);

    await act(async () => { buttons()[0]!.click(); });
    assert.deepEqual(useClashCell.getState().cell, { a: 'ASR', b: 'VZT' });
    await act(async () => { buttons()[0]!.click(); });
    assert.equal(useClashCell.getState().cell, null);
  });

  it('bez výsledkov behu presetu sa matica nezobrazí a zvolená bunka, ktorá v behu nie je, sa zruší', async () => {
    const preset = useViewerStore.getState().clashPresets[0]!;
    await render();
    assert.equal(buttons().length, 0);
    const raw = resultOf(preset.id, [clash('1', preset.id, 'm1', 'm2')]);
    useClashCell.setState({ cell: { a: 'VZT', b: 'VZT' } });
    await act(async () => { useViewerStore.setState({ models, clashRawResult: raw, clashResult: raw }); });
    assert.equal(useClashCell.getState().cell, null);
  });
});
