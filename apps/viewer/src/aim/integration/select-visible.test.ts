/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BimContext } from '@ifc-lite/sdk';

import { useViewerStore, type ViewerState } from '../../store/index.js';
import { invalidateVisibleBasketCache } from '../../store/basketVisibleSet.js';
import { selectPickedGlobalId } from '../../components/viewer/viewport-selection.js';
import { runVisibilityCommand, type VisibilityDeps } from '../visibility-commands.js';
import { isInboundMessage, type InboundMessage } from '../bridge-protocol.js';

/** SELECT { visible: true } (AIM #315): vyber všetkého, čo je po izolácii alebo Lens vidieť. */
const IDS = [1, 2, 3, 4, 5, 6];
let issues: string[] = [];

function seed(): void {
  invalidateVisibleBasketCache();
  useViewerStore.setState({
    models: new Map([['m', {
      id: 'm', idOffset: 0, maxExpressId: 100_000, visible: true,
      geometryResult: { meshes: IDS.map((expressId) => ({ expressId, ifcType: 'IfcWall' })) },
      ifcDataStore: { entities: { getTypeName: () => 'IfcWall', getGlobalId: (id: number) => `G${id}` } },
    }]]) as unknown as ViewerState['models'],
    ifcDataStore: null,
    hiddenEntities: new Set<number>(),
    lensHiddenIds: new Set<number>(),
    isolatedEntities: null,
  });
  useViewerStore.getState().clearEntitySelection();
}

const bim = { viewer: { colorize: () => undefined, colorizeRgba: () => undefined, resetColors: () => undefined, flyTo: () => undefined } } as unknown as BimContext;
const deps: VisibilityDeps = {
  resolveGuids: (_m, guids) => guids.map((g) => ({ modelId: 'm', expressId: Number(g.slice(1)) })),
  resolveSelector: () => [],
  selectPickedGlobalId,
  noteIssue: (t) => void issues.push(t),
  track: (p) => { void p.catch(() => undefined); },
  FOCUS_COLOR: '#f97316',
  FILTER_COLOR: '#ef4444',
};
const msg = (m: Record<string, unknown>) => ({ source: 'aim-bridge', ...m }) as unknown as InboundMessage;
const selected = () => [...useViewerStore.getState().selectedEntitiesSet].sort();

describe('SELECT s visible: true (#315)', () => {
  beforeEach(() => {
    issues = [];
    seed();
  });

  it('protokol: visible: true platí bez guid, nepravdivé alebo zmiešané tvary nie', () => {
    assert.ok(isInboundMessage(msg({ type: 'SELECT', visible: true })));
    assert.equal(isInboundMessage(msg({ type: 'SELECT', visible: false })), false);
    assert.equal(isInboundMessage(msg({ type: 'SELECT', visible: 'yes' })), false);
    assert.equal(isInboundMessage(msg({ type: 'SELECT', visible: true, guid: 'G1' })), false);
    assert.equal(isInboundMessage(msg({ type: 'SELECT' })), false);
  });

  it('bez izolácie vyberie všetky prvky modelu', () => {
    runVisibilityCommand(msg({ type: 'SELECT', visible: true }), bim, deps);
    assert.deepEqual(selected(), IDS.map((i) => `m:${i}`).sort());
    assert.deepEqual(issues, []);
  });

  it('po izolácii (Lens skrýva cez hiddenEntities aj lensHiddenIds) vyberie len viditeľné, nie skryté', () => {
    useViewerStore.setState({ hiddenEntities: new Set([4, 5, 6]), lensHiddenIds: new Set([4, 5, 6]) });
    runVisibilityCommand(msg({ type: 'SELECT', visible: true }), bim, deps);
    assert.deepEqual(selected(), ['m:1', 'm:2', 'm:3']);
  });

  it('po bežnej izolácii (isolatedEntities) vyberie izolované prvky', () => {
    useViewerStore.setState({ isolatedEntities: new Set([2, 5]) });
    runVisibilityCommand(msg({ type: 'SELECT', visible: true }), bim, deps);
    assert.deepEqual(selected(), ['m:2', 'm:5']);
  });

  it('keď nie je nič viditeľné, ohlási problém a výber nezmení', () => {
    useViewerStore.setState({ hiddenEntities: new Set(IDS) });
    runVisibilityCommand(msg({ type: 'SELECT', visible: true }), bim, deps);
    assert.deepEqual(selected(), []);
    assert.deepEqual(issues, ['SELECT: nič nie je viditeľné']);
  });
});
