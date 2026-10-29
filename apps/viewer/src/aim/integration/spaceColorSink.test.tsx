/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * Priestor nikdy plnou farbou (AIM D-173, #298), jediné miesto: farby, ktoré prejdú kanálom
 * `pendingColorUpdates` (Lens `color_by`, OR skupiny, ručné farbenie, kolízie), sa v
 * `useColorOverlaySync` zbavia plných farieb IfcSpace / IfcSpatialZone tesne pred rendererom.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useRef } from 'react';
import type { Renderer } from '@ifc-lite/renderer';
import { cleanup, render } from '@/test/render.js';
import { fixtureModel } from '@/test/store-fixture.js';
import { useViewerStore, type FederatedModel } from '@/store';
import { useColorOverlaySync } from '@/components/viewer/useColorOverlaySync.js';

type Rgba = [number, number, number, number];

function fakeRenderer(painted: Array<Map<number, Rgba>>): Renderer {
  const scene = {
    setColorOverrides: (o: Map<number, Rgba>) => painted.push(new Map(o)),
    clearColorOverrides: () => painted.push(new Map()),
    hasQueuedMeshes: () => false, hasMeshData: () => true, isInstancedEntity: () => false,
  };
  return { getGPUDevice: () => ({}), getPipeline: () => ({}), getScene: () => scene, requestRender: () => undefined } as unknown as Renderer;
}

function Bridge({ renderer }: { renderer: Renderer }): null {
  const s = useViewerStore();
  const rendererRef = useRef<Renderer | null>(renderer);
  useColorOverlaySync({ rendererRef, isInitialized: true, pendingColorUpdates: s.pendingColorUpdates, clearPendingColorUpdates: s.clearPendingColorUpdates });
  return null;
}

function seed(): void {
  const base = fixtureModel('a', { idOffset: 0 });
  const meshes = [{ expressId: 1, ifcType: 'IfcSpace' }, { expressId: 2, ifcType: 'IfcSpatialZone' }, { expressId: 3, ifcType: 'IfcWall' }];
  const model = { ...base, maxExpressId: 10, geometryResult: { meshes } } as unknown as FederatedModel;
  useViewerStore.setState({ models: new Map([['a', model]]), pendingColorUpdates: null });
}

afterEach(() => {
  cleanup();
  useViewerStore.setState({ models: new Map(), pendingColorUpdates: null });
});

describe('priestor nikdy plnou farbou: kanál do renderera (D-173)', () => {
  it('plná farba IfcSpace a IfcSpatialZone sa do renderera nedostane, stena áno', async () => {
    seed();
    const painted: Array<Map<number, Rgba>> = [];
    render(<Bridge renderer={fakeRenderer(painted)} />);
    useViewerStore.getState().setPendingColorUpdates(new Map<number, Rgba>([[1, [1, 0, 0, 1]], [2, [0, 1, 0, 1]], [3, [0, 0, 1, 1]]]));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(painted.length, 1);
    assert.deepEqual([...painted[0].keys()], [3]);
  });

  it('duch X-ray na priestore ostane', async () => {
    seed();
    const painted: Array<Map<number, Rgba>> = [];
    render(<Bridge renderer={fakeRenderer(painted)} />);
    useViewerStore.getState().setPendingColorUpdates(new Map<number, Rgba>([[1, [0.6, 0.6, 0.6, 0.15]]]));
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual([...painted[0].keys()], [1]);
  });
});
