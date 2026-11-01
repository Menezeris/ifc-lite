/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIMviewer #376: zapnutie a posun vodorovného rezu nesmie PDF podklady vyhodiť ani
 * rasterizovať znova. Skutočný `useDrawingUnderlay` a skutočná `PdfPlanePipeline` nad falošným
 * GPU zariadením (len záznam volaní); rasterizácia strany je vstrieknutá a dobieha, keď test povie.
 * Pozorovanie: koľko rasterizácií sa spustilo, koľko textúr vzniklo a zaniklo a koľko rovín
 * pipeline naozaj nakreslí (`render` do falošného passu).
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import type { MutableRefObject } from 'react';
import type { Renderer } from '@ifc-lite/renderer';
import { createDrawingPlacement, type PdfPlanePipeline } from '@ifc-lite/drawing-underlay';
import { useViewerStore } from '@/store';
import { fixtureModel } from '@/test/store-fixture';
import { cleanup, render } from '@/test/render';
import { useDrawingUnderlay, type RasterizeUnderlayPage } from '@/hooks/useDrawingUnderlay';
import { useAimUnderlays3d } from './aimUnderlays3d';

// WebGPU flag enums the pipeline reads at init; node has none.
const g = globalThis as Record<string, unknown>;
g.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
g.GPUBufferUsage ??= { UNIFORM: 64, COPY_DST: 8, VERTEX: 32 };
g.GPUTextureUsage ??= { TEXTURE_BINDING: 4, COPY_DST: 2, RENDER_ATTACHMENT: 16 };
g.GPUColorWrite ??= { ALL: 15 };

/** Falošné GPU: každé volanie vráti ďalší stub, textúry PDF sa počítajú. */
function fakeDevice() {
  const textures = { created: 0, destroyed: 0 };
  const stub = (): unknown => new Proxy(() => stub(), {
    get: (_t, key) => (key === 'then' ? undefined : stub()),
    apply: () => stub(),
  });
  const device = {
    limits: { maxTextureDimension2D: 8192 },
    queue: { writeBuffer: () => {}, copyExternalImageToTexture: () => {}, submit: () => {} },
    createTexture: (d: { label?: string }) => {
      if (d.label === 'pdf-plane-texture') textures.created++;
      return { createView: () => ({}), destroy: () => { if (d.label === 'pdf-plane-texture') textures.destroyed++; } };
    },
    createBuffer: () => ({ destroy: () => {} }),
    createBindGroupLayout: () => ({}), createShaderModule: () => ({}), createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }), createBindGroup: () => ({}), createSampler: () => ({}),
    createCommandEncoder: () => stub(),
  };
  return { device: device as unknown as GPUDevice, textures };
}

/** Renderer s jedným externým overlay a počítadlom nakreslených rovín. */
function fakeRenderer(device: GPUDevice) {
  let overlay: PdfPlanePipeline | null = null;
  const renderer = {
    getOverlayPassDescriptor: () => ({ device, format: 'bgra8unorm' as GPUTextureFormat }),
    registerExternalOverlay: (_id: string, o: PdfPlanePipeline) => { overlay = o; },
    unregisterExternalOverlay: () => { overlay = null; },
    requestRender: () => {},
  };
  const drawnPlanes = (): number => {
    if (!overlay || !overlay.hasGeometry()) return 0;
    let draws = 0;
    const pass = { setPipeline: () => {}, setBindGroup: () => {}, setVertexBuffer: () => {}, draw: () => { draws++; } };
    overlay.render(pass as unknown as GPURenderPassEncoder, new Float32Array(16));
    return draws;
  };
  return { renderer: renderer as unknown as Renderer, drawnPlanes };
}

/** Rasterizácia, ktorú test dokončí ručne. */
function deferredRaster() {
  const calls: Array<{ url: string; resolve: () => void }> = [];
  const rasterize: RasterizeUnderlayPage = (url) => new Promise((resolve) => {
    calls.push({ url, resolve: () => resolve({ width: 64, height: 64, close: () => {} } as unknown as ImageBitmap) });
  });
  return { calls, rasterize };
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function placement(storeyZ: number) {
  return createDrawingPlacement({
    storeyGuid: `S${storeyZ}`, storeyZ, page: 1, pageSize: [800, 600],
    affine: [0.01, 0, 0, 0.01, 0, 0], calibration: [],
  });
}

/** Budova 0 až 10 m (Y hore v rámci viewera), podklady 1NP (0 m), 2NP (3 m), 3NP (6 m). */
function seedStore() {
  const model = fixtureModel('m1');
  (model as unknown as { geometryResult: unknown }).geometryResult = {
    coordinateInfo: {
      originShift: { x: 0, y: 0, z: 0 },
      originalBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      shiftedBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      hasLargeCoordinates: false,
    },
  };
  useViewerStore.setState({
    models: new Map([[model.id, model]]),
    underlayCalibration: null,
    underlayCut: null,
    underlayViewLocked: false,
    sectionPlane: { ...useViewerStore.getState().sectionPlane, axis: 'down', position: 50, enabled: false, flipped: false, box: undefined },
  });
  useViewerStore.getState().setUnderlayDrawings([0, 3, 6].map((z) => ({
    id: `d${z}`, name: `${z} m`, pdfUrl: `https://pdf.test/${z}.pdf`, placement: placement(z),
  })));
  useAimUnderlays3d.setState({ hidden: false, overrides: {} });
}

const setCut = (position: number | null) => act(() => {
  const s = useViewerStore.getState().sectionPlane;
  useViewerStore.setState({ sectionPlane: { ...s, position: position ?? s.position, enabled: position !== null } });
});

function mount(rasterize: RasterizeUnderlayPage) {
  const gpu = fakeDevice();
  const { renderer, drawnPlanes } = fakeRenderer(gpu.device);
  const rendererRef: MutableRefObject<Renderer | null> = { current: renderer };
  function Probe() {
    useDrawingUnderlay({ rendererRef, isInitialized: true, rasterize });
    return null;
  }
  render(React.createElement(Probe));
  return { textures: gpu.textures, drawnPlanes };
}

describe('PDF podklady a vodorovný rez (AIMviewer #376)', () => {
  beforeEach(seedStore);
  afterEach(cleanup);

  it('zapnutie, posun a vypnutie rezu podklady len skryje a ukáže, bez novej rasterizácie', async () => {
    const raster = deferredRaster();
    const view = mount(raster.rasterize);
    assert.equal(raster.calls.length, 3);
    for (const c of raster.calls) c.resolve();
    await flush();
    assert.equal(view.drawnPlanes(), 3);
    assert.equal(view.textures.created, 3);

    setCut(42); // 4,2 m: len 2NP
    assert.equal(view.drawnPlanes(), 1);
    setCut(12); // 1,2 m nad 1NP
    setCut(72); // 7,2 m: 3NP
    assert.equal(view.drawnPlanes(), 1);
    setCut(null);
    await flush();

    assert.equal(view.drawnPlanes(), 3, 'po vypnutí rezu sú späť všetky podklady');
    assert.equal(raster.calls.length, 3, 'rez nespustil novú rasterizáciu');
    assert.equal(view.textures.destroyed, 0, 'rez nezahodil žiadnu textúru');
  });

  it('ťahanie rezu počas rasterizácie ju nezahodí ani nespustí znova a podklad sa vráti', async () => {
    const raster = deferredRaster();
    setCut(12); // pohľad zhora 1NP s rezom 1,2 m ešte pred načítaním podkladov
    const view = mount(raster.rasterize);
    for (let p = 13; p <= 40; p++) setCut(p); // ťahanie: každý krok je nová synchronizácia
    setCut(12);
    // 1NP, potom 2NP, keď ťahaný rez prešiel nad 3 m: každé raz, nie za každý krok; 3NP rez neukázal
    assert.equal(raster.calls.length, 2, 'jedna rasterizácia na podlažie, ktoré rez ukázal');
    for (const c of raster.calls) c.resolve();
    await flush();
    assert.equal(view.drawnPlanes(), 1, 'podklad 1NP je pod rezom 1,2 m vidno');

    setCut(null);
    assert.equal(raster.calls.length, 3, 'po vypnutí rezu sa dopočíta len chýbajúce 3NP');
    raster.calls[2].resolve();
    await flush();
    assert.equal(view.drawnPlanes(), 3);
    assert.equal(view.textures.created, 3);
  });

  it('zlyhaná rasterizácia sa pri ďalšej synchronizácii skúsi znova', async () => {
    let fail = true;
    let calls = 0;
    const rasterize: RasterizeUnderlayPage = async () => {
      calls++;
      if (fail) throw new Error('canvas out of memory');
      return { width: 8, height: 8, close: () => {} } as unknown as ImageBitmap;
    };
    const errors = console.error;
    console.error = () => {};
    try {
      const view = mount(rasterize);
      await flush();
      assert.equal(view.drawnPlanes(), 0);
      fail = false;
      setCut(12);
      setCut(null);
      await flush();
      assert.ok(calls > 3);
      assert.equal(view.drawnPlanes(), 3);
    } finally {
      console.error = errors;
    }
  });
});
