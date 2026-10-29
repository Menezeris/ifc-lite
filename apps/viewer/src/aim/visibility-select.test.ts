/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BimContext, EntityRef } from '@ifc-lite/sdk';

import { useViewerStore, type ViewerState } from '../store/index.js';
import { selectPickedGlobalId } from '../components/viewer/viewport-selection.js';
import { runVisibilityCommand, type VisibilityDeps } from './visibility-commands.js';
import type { InboundMessage } from './bridge-protocol.js';

const COUNT = 300;
const GUIDS = Array.from({ length: COUNT }, (_, i) => `G${i}`);
const refOf = (guid: string): EntityRef => ({ modelId: 'm', expressId: 1000 + Number(guid.slice(1)) });

function seedModels(typeName: string): void {
  useViewerStore.setState({
    models: new Map([['m', {
      id: 'm', idOffset: 0, maxExpressId: 100_000,
      ifcDataStore: { entities: { getTypeName: () => typeName, getGlobalId: (id: number) => `G${id - 1000}` } },
    }]]) as unknown as ViewerState['models'],
    ifcDataStore: null,
  });
  useViewerStore.getState().clearEntitySelection();
}

interface Calls { colorize: unknown[][]; colorizeRgba: unknown[][]; resetColors: unknown[][] }

function fakeBim(calls: Calls): BimContext {
  return {
    viewer: {
      colorize: (...a: unknown[]) => { calls.colorize.push(a); },
      colorizeRgba: (...a: unknown[]) => { calls.colorizeRgba.push(a); },
      resetColors: (...a: unknown[]) => { calls.resetColors.push(a); },
      flyTo: () => undefined,
    },
  } as unknown as BimContext;
}

const deps: VisibilityDeps = {
  resolveGuids: (_models, guids) => guids.map(refOf),
  resolveSelector: () => [],
  selectPickedGlobalId,
  noteIssue: () => undefined,
  track: (p) => { void p.catch(() => undefined); },
  FOCUS_COLOR: '#f97316',
  FILTER_COLOR: '#ef4444',
};

const msg = (m: Record<string, unknown>) => ({ source: 'aim-bridge', ...m }) as unknown as InboundMessage;

describe('SELECT s mnohými prvkami (AIM #273)', () => {
  beforeEach(() => seedModels('IfcWall'));

  it('vyberie všetky prvky a store zapíše len pár ráz, nie stovky', () => {
    let writes = 0;
    const off = useViewerStore.subscribe(() => { writes++; });
    runVisibilityCommand(msg({ type: 'SELECT', guid: GUIDS[0], guids: GUIDS }), fakeBim({ colorize: [], colorizeRgba: [], resetColors: [] }), deps);
    off();
    const s = useViewerStore.getState();
    assert.equal(s.selectedEntityIds.size, COUNT);
    assert.equal(s.selectedEntitiesSet.size, COUNT);
    assert.ok(writes <= 10, `SELECT ${COUNT} prvkov zapísal store ${writes} x (rad Ctrl+klikov: ${COUNT * 4})`);
  });
});
