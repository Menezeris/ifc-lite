/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { useViewerStore, type ViewerState } from '@/store';
import { invalidateVisibleBasketCache } from '@/store/basketVisibleSet';
import { runViewsMessage, stopViewsBridge } from '../viewsBridge.js';
import type { ViewsOutboundMessage } from '../views-protocol.js';
import type { GuidHelpers } from '../viewQueries.js';

/**
 * VIEW_CAPTURE pri izolácii (AIM #315): pohľad uložený z chatu mal pri Lens izolácii v košíku len
 * jeden prvok (vybraný alebo zo starého košíka), hoci viditeľných bolo viac.
 */
const S = 'aim-bridge' as const;
const IDS = [1, 2, 3, 4, 5, 6];
let issues: string[] = [];
const guids = {
  resolveGuids: () => [],
  guidForEntity: (_m: unknown, ref: { expressId: number }) => `G${ref.expressId}`,
  sectionRenderBounds: () => ({ min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } }),
} as unknown as GuidHelpers;
const deps = () => ({ post: (_m: ViewsOutboundMessage) => {}, noteIssue: (t: string) => void issues.push(t), track: () => {}, guids });

function seed(patch: Partial<ViewerState> = {}): void {
  invalidateVisibleBasketCache();
  useViewerStore.setState({
    models: new Map([['m', {
      id: 'm', idOffset: 0, maxExpressId: 100_000, visible: true,
      geometryResult: { meshes: IDS.map((expressId) => ({ expressId, ifcType: 'IfcWall' })) },
      ifcDataStore: { entities: { getTypeName: () => 'IfcWall', getGlobalId: (id: number) => `G${id}` } },
    }]]) as unknown as ViewerState['models'],
    ifcDataStore: null,
    basketViews: [], activeBasketViewId: null, pinboardEntities: new Set(),
    hiddenEntities: new Set<number>(), lensHiddenIds: new Set<number>(), isolatedEntities: null, classFilter: null,
    ...patch,
  });
  useViewerStore.getState().clearEntitySelection();
}
const capture = async () => {
  await runViewsMessage({ source: S, type: 'VIEW_CAPTURE', name: 'Pohľad' }, deps());
  const views = useViewerStore.getState().basketViews;
  return views[views.length - 1];
};
const select = (...ids: number[]) => useViewerStore.getState().setSelectedEntities(ids.map((expressId) => ({ modelId: 'm', expressId })));

beforeEach(() => { issues = []; });
afterEach(() => stopViewsBridge());

describe('VIEW_CAPTURE zachytí viditeľné prvky z izolácie (#315)', () => {
  it('Lens izolácia + jeden vybraný prvok: v košíku sú všetky viditeľné, nielen výber', async () => {
    seed({ hiddenEntities: new Set([4, 5, 6]), lensHiddenIds: new Set([4, 5, 6]) });
    select(2);
    const view = await capture();
    assert.deepEqual([...view.entityRefs].sort(), ['m:1', 'm:2', 'm:3']);
    assert.equal(view.source, 'visible');
  });

  it('bežná izolácia (isolatedEntities) + vybraný prvok: v košíku sú všetky izolované prvky', async () => {
    seed({ isolatedEntities: new Set([2, 3, 5]) });
    select(3);
    const view = await capture();
    assert.deepEqual([...view.entityRefs].sort(), ['m:2', 'm:3', 'm:5']);
  });

  it('starý jednoprvkový košík z minulého uloženia nezostane, keď sa izolácia zmenila', async () => {
    seed({ hiddenEntities: new Set([4, 5, 6]), lensHiddenIds: new Set([4, 5, 6]), pinboardEntities: new Set(['m:1']) });
    const view = await capture();
    assert.deepEqual([...view.entityRefs].sort(), ['m:1', 'm:2', 'm:3']);
  });

  it('bez izolácie platí výber ako doteraz', async () => {
    seed();
    select(2);
    const view = await capture();
    assert.deepEqual(view.entityRefs, ['m:2']);
    assert.equal(view.source, 'selection');
  });

  it('bez izolácie a bez výberu sa uloží celý model', async () => {
    seed();
    const view = await capture();
    assert.equal(view.entityRefs.length, IDS.length);
    assert.equal(view.source, 'visible');
  });

  it('keď je všetko skryté, ohlási problém a nič neuloží', async () => {
    seed({ hiddenEntities: new Set(IDS) });
    await runViewsMessage({ source: S, type: 'VIEW_CAPTURE' }, deps());
    assert.equal(useViewerStore.getState().basketViews.length, 0);
    assert.match(issues[0], /VIEW_CAPTURE: nič na uloženie/);
  });
});
