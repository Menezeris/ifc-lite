/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  highlightStyle,
  MAX_HIGHLIGHTS,
  normalizeDocHighlights,
  normalizeDocRegion,
  regionScroll,
  regionZoom,
  useAimDocRegionStore,
  REGION_ZOOM_MAX,
  REGION_ZOOM_MIN,
} from './docRegion.js';

describe('normalizeDocRegion (D-117)', () => {
  it('accepts a page region in fractions', () => {
    assert.deepEqual(normalizeDocRegion({ x: 0.6, y: 0.1, w: 0.3, h: 0.2 }), { x: 0.6, y: 0.1, w: 0.3, h: 0.2 });
  });

  it('rejects missing, non-numeric and empty regions', () => {
    assert.equal(normalizeDocRegion(undefined), null);
    assert.equal(normalizeDocRegion('0.1,0.1,0.2,0.2'), null);
    assert.equal(normalizeDocRegion({ x: 0.1, y: 0.1, w: 0.2 }), null);
    assert.equal(normalizeDocRegion({ x: 0.1, y: 0.1, w: Number.NaN, h: 0.2 }), null);
    assert.equal(normalizeDocRegion({ x: 0.1, y: 0.1, w: 0, h: 0.2 }), null);
  });

  it('clamps the region into the page', () => {
    const edge = normalizeDocRegion({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 })!;
    assert.deepEqual({ x: edge.x, y: edge.y, w: edge.w }, { x: 0, y: 0.9, w: 0.5 });
    assert.ok(Math.abs(edge.h - 0.1) < 1e-9);
    const tiny = normalizeDocRegion({ x: 0.5, y: 0.5, w: 0.0001, h: 0.0001 });
    assert.deepEqual(tiny, { x: 0.5, y: 0.5, w: 0.01, h: 0.01 });
  });
});

describe('regionZoom (D-117)', () => {
  const viewport = { width: 824, height: 624 };

  it('fills the viewport width with a wide region', () => {
    // Strana 800 px pri zoome 1, A4 na šírku (aspect 1.414); výrez polovica šírky.
    const z = regionZoom({ x: 0.5, y: 0, w: 0.5, h: 0.1 }, 800, viewport, 1.414);
    assert.equal(z, 800 / (0.5 * 800));
  });

  it('is limited by the viewport height for a tall region', () => {
    const z = regionZoom({ x: 0, y: 0, w: 0.1, h: 0.5 }, 800, viewport, 1.414);
    assert.ok(Math.abs(z - (600 * 1.414) / (0.5 * 800)) < 1e-9);
  });

  it('stays within the zoom bounds of the tab', () => {
    assert.equal(regionZoom({ x: 0, y: 0, w: 0.01, h: 0.01 }, 800, viewport, 1.414), REGION_ZOOM_MAX);
    assert.equal(regionZoom({ x: 0, y: 0, w: 1, h: 1 }, 8000, viewport, 0.2), REGION_ZOOM_MIN);
  });
});

describe('regionScroll (D-117)', () => {
  it('centers the region in the viewport', () => {
    const pos = regionScroll(
      { x: 0.6, y: 0.2, w: 0.2, h: 0.2 },
      { left: 12, top: 1000, width: 2000, height: 1414 },
      { width: 800, height: 600 },
    );
    assert.equal(pos.left, 12 + 0.7 * 2000 - 400);
    assert.ok(Math.abs(pos.top - (1000 + 0.3 * 1414 - 300)) < 1e-9);
  });

  it('does not scroll before the content start', () => {
    assert.deepEqual(
      regionScroll({ x: 0, y: 0, w: 0.1, h: 0.1 }, { left: 0, top: 0, width: 1000, height: 700 }, { width: 800, height: 600 }),
      { left: 0, top: 0 },
    );
  });
});

describe('useAimDocRegionStore (D-117)', () => {
  it('re-requests the same region with a new nonce and clears only the consumed one', () => {
    const store = useAimDocRegionStore.getState();
    const region = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    store.requestRegion('doc-1', region, 2);
    const first = useAimDocRegionStore.getState().request!;
    store.requestRegion('doc-1', region, 2);
    const second = useAimDocRegionStore.getState().request!;
    assert.equal(second.nonce, first.nonce + 1);
    assert.equal(second.page, 2);
    useAimDocRegionStore.getState().clear(first.nonce);
    assert.equal(useAimDocRegionStore.getState().request?.nonce, second.nonce);
    useAimDocRegionStore.getState().clear(second.nonce);
    assert.equal(useAimDocRegionStore.getState().request, null);
  });
});

describe('normalizeDocHighlights (D-123)', () => {
  it('keeps thin text-line rectangles without inflating them to the region minimum', () => {
    assert.deepEqual(normalizeDocHighlights([{ x: 0.383, y: 0.5605, w: 0.0075, h: 0.012 }]), [
      { x: 0.383, y: 0.5605, w: 0.0075, h: 0.012 },
    ]);
  });

  it('drops invalid and off-page rectangles and accepts only arrays', () => {
    assert.deepEqual(normalizeDocHighlights(undefined), []);
    assert.deepEqual(normalizeDocHighlights({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }), []);
    assert.deepEqual(
      normalizeDocHighlights([
        null,
        { x: 0.1, y: 0.1, w: 0, h: 0.1 },
        { x: 1.2, y: 0.1, w: 0.1, h: 0.1 },
        { x: -0.5, y: 0.1, w: 0.2, h: 0.1 },
        { x: '0.1', y: 0.1, w: 0.1, h: 0.1 },
      ]),
      [],
    );
  });

  it('clips a rectangle that crosses the page edge and caps the count', () => {
    const [r] = normalizeDocHighlights([{ x: -0.1, y: 0.95, w: 0.3, h: 0.2 }]);
    assert.equal(r.x, 0);
    assert.ok(Math.abs(r.w - 0.2) < 1e-9);
    assert.ok(Math.abs(r.h - 0.05) < 1e-9);
    const many = Array.from({ length: MAX_HIGHLIGHTS + 5 }, () => ({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }));
    assert.equal(normalizeDocHighlights(many).length, MAX_HIGHLIGHTS);
  });

  it('positions a frame in page percent', () => {
    assert.deepEqual(highlightStyle({ x: 0.383, y: 0.5605, w: 0.0075, h: 0.012 }), {
      left: '38.3%',
      top: '56.05%',
      width: '0.75%',
      height: '1.2%',
    });
  });
});

describe('useAimDocRegionStore highlights (D-123)', () => {
  it('replaces frames on every open and clears them with an empty list', () => {
    const store = useAimDocRegionStore.getState();
    store.setHighlights('doc-1', [{ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }], 1);
    const first = useAimDocRegionStore.getState().highlights!;
    assert.equal(first.page, 1);
    store.setHighlights('doc-1', [{ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }]);
    const second = useAimDocRegionStore.getState().highlights!;
    assert.equal(second.nonce, first.nonce + 1);
    assert.equal(second.page, undefined);
    store.setHighlights('doc-2', []);
    assert.equal(useAimDocRegionStore.getState().highlights, null);
  });
});
