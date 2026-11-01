/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A tap is measured from the browser's input time (`Event.timeStamp`), not from when the handler ran.
 * On a slow device the main thread can be blocked between touchstart and touchend, so the handlers run
 * hundreds of milliseconds apart for a tap the finger made in 50 ms; that tap must still select.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { Camera, type Renderer } from '@ifc-lite/renderer';
import { render, cleanup } from '@/test/render.js';
import { useTouchControls, type UseTouchControlsParams } from '../components/viewer/useTouchControls.js';

const ref = <T,>(current: T) => ({ current });
const noop = () => {};

function rig() {
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 600;
  canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
  document.body.appendChild(canvas);
  const camera = new Camera();
  camera.setAspect(800 / 600);
  camera.setPosition(0, 0, 10);
  camera.setTarget(0, 0, 0);
  const renderer = {
    getCamera: () => camera,
    requestRender: noop,
    getScene: () => ({ getMeshes: () => [], getBatchedMeshes: () => [], getInstancedEntityCount: () => 0 }),
    pick: async () => ({ expressId: 42 }),
    pickRect: async () => [],
    raycastScene: () => null,
  } as unknown as Renderer;
  let selections = 0;
  const params: UseTouchControlsParams = {
    canvasRef: ref(canvas), rendererRef: ref(renderer), isInitialized: true, activeToolRef: ref('select'),
    hiddenEntitiesRef: ref(new Set<number>()), isolatedEntitiesRef: ref(null), selectedEntityIdRef: ref(null),
    selectedModelIndexRef: ref(undefined), clearColorRef: ref([0, 0, 0, 1]), sectionPlaneRef: ref(null as never),
    sectionRangeRef: ref(null), geometryRef: ref(null), isInteractingRef: ref(false),
    handlePickForSelection: () => { selections++; },
    openContextMenu: noop,
    getPickOptions: () => ({ isStreaming: false, hiddenIds: new Set<number>(), isolatedIds: null }),
    touchStateRef: ref({ touches: [], lastDistance: 0, lastCenter: { x: 0, y: 0 }, tapStartTime: 0,
      tapStartPos: { x: 0, y: 0 }, didMove: false, multiTouch: false, twoFingerGesture: 'none' as const,
      gestureDistanceAccum: 0, gesturePanAccum: 0 }),
  };
  function Probe() { useTouchControls(params); return null; }
  render(<Probe />);
  return { canvas, selectionCount: () => selections };
}

function touchEvent(kind: string, canvas: HTMLCanvasElement, points: Array<[number, number]>, stamp: number): Event {
  const event = new window.Event(kind, { bubbles: true, cancelable: true });
  const touches = points.map(([x, y], i) => ({ identifier: i + 1, target: canvas, clientX: x, clientY: y }));
  Object.defineProperty(event, 'touches', { value: touches });
  Object.defineProperty(event, 'changedTouches', { value: touches });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  return event;
}

afterEach(() => {
  mock.restoreAll();
  cleanup();
  for (const canvas of document.querySelectorAll('canvas')) canvas.remove();
});

describe('tap length comes from the input time', () => {
  it('selects a 50 ms tap even when the handlers ran 400 ms apart', async () => {
    let handlerClock = 1_000_000;
    mock.method(Date, 'now', () => handlerClock);
    const { canvas, selectionCount } = rig();
    act(() => canvas.dispatchEvent(touchEvent('touchstart', canvas, [[200, 300]], 1000)));
    handlerClock += 400; // the main thread was blocked; Date.now() moves, the input stamps do not
    await act(async () => { canvas.dispatchEvent(touchEvent('touchend', canvas, [], 1050)); await Promise.resolve(); });
    assert.equal(selectionCount(), 1);
  });

  it('still ignores a slow press (input stamps 400 ms apart)', async () => {
    const { canvas, selectionCount } = rig();
    act(() => canvas.dispatchEvent(touchEvent('touchstart', canvas, [[200, 300]], 1000)));
    await act(async () => { canvas.dispatchEvent(touchEvent('touchend', canvas, [], 1400)); await Promise.resolve(); });
    assert.equal(selectionCount(), 0);
  });
});
