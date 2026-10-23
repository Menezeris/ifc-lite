/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { useViewerStore } from '@/store';
import type { BasketView } from '@/store/slices/pinboardSlice';
import { runViewsMessage, stopViewsBridge } from '../viewsBridge.js';
import type { ViewsOutboundMessage, ViewWire } from '../views-protocol.js';
import type { GuidHelpers } from '../viewQueries.js';

const S = 'aim-bridge' as const;
const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms));

let posted: ViewsOutboundMessage[] = [];
let issues: string[] = [];
const guids = {
  resolveGuids: (_m: unknown, gs: readonly string[]) => gs.map((g) => ({ modelId: 'm', expressId: Number(g.slice(1)) })),
  guidForEntity: (_m: unknown, ref: { expressId: number }) => `G${ref.expressId}`,
  sectionRenderBounds: () => ({ min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } }),
} as unknown as GuidHelpers;
const deps = () => ({ post: (m: ViewsOutboundMessage) => void posted.push(m), noteIssue: (t: string) => void issues.push(t), track: () => {}, guids });

const wire = (id: string, order: number, name = id): ViewWire => ({
  id, name, order, transition_ms: null, source: 'manual', camera: null, section: null, basket: { scope: 'guids', guids: ['G1', 'G2'] }, objects: 2,
});
const local = (id: string): BasketView => ({
  id, name: `Basket ${id}`, entityRefs: ['m:1'], thumbnailDataUrl: null, transitionMs: null, viewpoint: null, section: null,
  source: 'manual', createdAt: 1, updatedAt: 1,
});
const ids = () => useViewerStore.getState().basketViews.map((v) => v.id);
const load = (...views: ViewWire[]) => runViewsMessage({ source: S, type: 'VIEWS_LOAD', views }, deps());
const types = () => posted.map((m) => m.type);

beforeEach(() => {
  posted = [];
  issues = [];
  useViewerStore.setState({ basketViews: [], activeBasketViewId: null, models: new Map(), pinboardEntities: new Set() });
});
afterEach(() => stopViewsBridge());

describe('most Presentation <-> uložené pohľady (AIM D-161)', () => {
  it('VIEWS_LOAD naplní pás v poradí `order` a hostovi nič nepošle späť', async () => {
    load(wire('b', 1), wire('a', 0));
    assert.deepEqual(ids(), ['a', 'b']);
    await wait();
    assert.deepEqual(posted, []);
  });

  it('pohľad uložený v paneli ide hostovi s id aj poradím', async () => {
    load(wire('a', 0));
    useViewerStore.setState((s) => ({ basketViews: [...s.basketViews, local('n')] }));
    await wait();
    assert.deepEqual(types(), ['VIEW_SAVE']);
    const msg = posted[0] as Extract<ViewsOutboundMessage, { type: 'VIEW_SAVE' }>;
    assert.equal(msg.view.id, 'n');
    assert.equal(msg.view.order, 1);
    assert.deepEqual(msg.view.basket, { scope: 'guids', guids: ['G1'] });
  });

  it('premenovanie je VIEW_RENAME, úprava obsahu VIEW_SAVE, zmazanie VIEW_DELETE', async () => {
    load(wire('a', 0), wire('b', 1));
    useViewerStore.getState().renameBasketView('a', 'Nové meno');
    await wait();
    assert.deepEqual(posted, [{ source: S, type: 'VIEW_RENAME', id: 'a', name: 'Nové meno' }]);
    posted = [];
    useViewerStore.getState().setBasketViewTransitionMs('b', 900);
    await wait();
    assert.deepEqual(types(), ['VIEW_SAVE']);
    posted = [];
    useViewerStore.getState().removeBasketView('b');
    await wait();
    assert.deepEqual(posted, [{ source: S, type: 'VIEW_DELETE', id: 'b' }]);
  });

  it('nový VIEWS_LOAD odoberie pohľady, ktoré host už nemá; lokálne nepotvrdené ostanú', async () => {
    load(wire('a', 0), wire('b', 1));
    useViewerStore.setState((s) => ({ basketViews: [...s.basketViews, local('n')] }));
    await wait();
    posted = [];
    load(wire('a', 0, 'Premenované hostom'));
    assert.deepEqual(ids(), ['a', 'n']);
    assert.equal(useViewerStore.getState().basketViews[0].name, 'Premenované hostom');
    await wait();
    assert.deepEqual(posted, []);
  });

  it('naraz zmizne viac pohľadov (nový súbor): hostovi sa nič nemaže a pohľady sa naplnia znova', async () => {
    load(wire('a', 0), wire('b', 1), wire('c', 2));
    useViewerStore.setState({ basketViews: [], models: new Map([['m', { id: 'm', visible: true } as never]]) });
    await wait();
    assert.deepEqual(types(), []);
    assert.deepEqual(ids(), ['a', 'b', 'c']);
  });

  it('zmazanie posledného pohľadu rukou (modely nezmenené) je VIEW_DELETE', async () => {
    load(wire('a', 0));
    useViewerStore.getState().removeBasketView('a');
    await wait();
    assert.deepEqual(types(), ['VIEW_DELETE']);
  });

  it('tri pohľady zmazané rukou naraz (modely nezmenené) sa hostovi hlásia', async () => {
    load(wire('a', 0), wire('b', 1), wire('c', 2), wire('d', 3));
    useViewerStore.setState((s) => ({ basketViews: s.basketViews.filter((v) => v.id === 'd') }));
    await wait();
    assert.deepEqual(types(), ['VIEW_DELETE', 'VIEW_DELETE', 'VIEW_DELETE']);
  });

  it('tri a viac pohľadov zmizne spolu s výmenou modelov, ale nie všetky: hostovi sa nič nemaže', async () => {
    load(wire('a', 0), wire('b', 1), wire('c', 2), wire('d', 3));
    useViewerStore.setState((s) => ({ basketViews: s.basketViews.filter((v) => v.id === 'd'), models: new Map([['m', { id: 'm', visible: true } as never]]) }));
    await wait();
    assert.deepEqual(types(), []);
  });

  it('VIEW_ACTIVATE a VIEW_CAPTURE: neznámy pohľad a prázdny model sa ohlásia', async () => {
    load(wire('a', 0));
    await runViewsMessage({ source: S, type: 'VIEW_ACTIVATE', id: 'nie-je' }, deps());
    assert.match(issues[0], /VIEW_ACTIVATE: pohľad 'nie-je' sa vo vieweri nenašiel/);
    await runViewsMessage({ source: S, type: 'VIEW_CAPTURE', name: 'Rez' }, deps());
    assert.match(issues[1], /VIEW_CAPTURE: nič na uloženie/);
    runViewsMessage({ source: S, type: 'VIEW_ACTIVATE' }, deps());
    assert.match(issues[2], /neplatná správa/);
  });
});
