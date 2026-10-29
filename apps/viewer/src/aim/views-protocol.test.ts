/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_VIEWS, isViewWire, isViewsInbound, type ViewWire } from './views-protocol.js';

const S = 'aim-bridge' as const;
const wire = (over: Partial<ViewWire> = {}): ViewWire => ({
  id: 'v1', name: 'Pôdorys 1NP', order: 0, transition_ms: null, source: 'visible',
  camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 0.8, projection: 'orthographic', ortho_size: 12 },
  section: { planes: [{ name: 'A', axis: 'y', position_percent: 40, coordinate: 1.2, flipped: false, enabled: true, show_gizmo: true, show_cap: true, show_outlines: true }], active: 0 },
  basket: { scope: 'all', hidden_guids: [] }, objects: 3657, ...over,
});

describe('správy o pohľadoch (AIM D-161)', () => {
  it('VIEWS_LOAD: platný zoznam aj prázdny, najviac MAX_VIEWS riadkov', () => {
    assert.ok(isViewsInbound({ source: S, type: 'VIEWS_LOAD', views: [wire(), wire({ id: 'v2', camera: null, section: null, basket: { scope: 'guids', guids: ['G1'], truncated: true } })] }));
    assert.ok(isViewsInbound({ source: S, type: 'VIEWS_LOAD', views: [] }));
    assert.ok(!isViewsInbound({ source: S, type: 'VIEWS_LOAD', views: Array.from({ length: MAX_VIEWS + 1 }, (_, i) => wire({ id: `v${i}` })) }));
    assert.ok(!isViewsInbound({ source: S, type: 'VIEWS_LOAD' }));
    assert.ok(!isViewsInbound({ source: 'x', type: 'VIEWS_LOAD', views: [] }));
  });

  it('jeden neplatný riadok zahodí celý zoznam (nenaplní sa polovica)', () => {
    assert.ok(!isViewsInbound({ source: S, type: 'VIEWS_LOAD', views: [wire(), { ...wire({ id: 'v2' }), basket: { scope: 'nič' } }] }));
    assert.ok(!isViewWire({ ...wire(), camera: { ...wire().camera, position: [0, 0] } }));
    assert.ok(!isViewWire({ ...wire(), order: 1.5 }));
    assert.ok(!isViewWire({ ...wire(), name: '' }));
    assert.ok(!isViewWire({ ...wire(), source: 'chat' }));
    assert.ok(!isViewWire({ ...wire(), section: { planes: [], active: 0 } }));
    assert.ok(!isViewWire({ ...wire(), section: { planes: wire().section!.planes, active: 1 } }));
    assert.ok(!isViewWire({ ...wire(), camera: { ...wire().camera, position: [0, 0, Number.NaN] } }));
  });

  it('VIEW_ACTIVATE: id alebo meno; VIEW_CAPTURE: voliteľné meno a capture_id', () => {
    assert.ok(isViewsInbound({ source: S, type: 'VIEW_ACTIVATE', id: 'v1' }));
    assert.ok(isViewsInbound({ source: S, type: 'VIEW_ACTIVATE', name: 'Pôdorys 1NP' }));
    assert.ok(!isViewsInbound({ source: S, type: 'VIEW_ACTIVATE' }));
    assert.ok(!isViewsInbound({ source: S, type: 'VIEW_ACTIVATE', id: '  ' }));
    assert.ok(isViewsInbound({ source: S, type: 'VIEW_CAPTURE' }));
    assert.ok(isViewsInbound({ source: S, type: 'VIEW_CAPTURE', name: 'Rez A', capture_id: 'c1' }));
    assert.ok(!isViewsInbound({ source: S, type: 'VIEW_CAPTURE', name: 5 }));
    assert.ok(!isViewsInbound({ source: S, type: 'VIEW_SAVE', view: wire() }));
  });

  it('pohľad so stavom podkladov (AIM #325) prejde, s neplatným nie', () => {
    assert.ok(isViewWire(wire({ underlays: { show: true, items: [{ document_id: 'd2', visible: true, opacity: 0.6 }] } })));
    assert.ok(!isViewWire(wire({ underlays: { show: true, items: [{ document_id: 'd2', visible: true, opacity: 3 }] } })));
  });
});
