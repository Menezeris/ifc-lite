/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Integracia: UNDERLAY_SAVE -> host (PATCH) -> UNDERLAYS_LOAD so skutocnym storom a mostom (AIM #187 follow-up). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { useViewerStore } from '../store/index.js';
import { handleDocumentMessage, wireDocumentEvents } from './docBridge.js';
import type { InboundMessage, OutboundMessage } from './bridge-protocol.js';

const K = (0.0254 / 72) * 100;
const cal = (affine: number[], extra: Record<string, unknown> = {}) => ({
  page: 1, page_size: [1190, 842], affine, plane: { origin: [0, 5, 0], u: [1, 0, 0], v: [0, 0, 1] },
  opacity: 0.6, visible: true, source: 'auto', ...extra,
});
const load = (c: unknown): InboundMessage => ({
  source: 'aim-host', type: 'UNDERLAYS_LOAD',
  drawings: [{ documentId: 'rez-a', name: 'REZ-A', pdfUrl: 'a.pdf', georefV2: { calibrations: [c] } }],
} as unknown as InboundMessage);
const affineOf = () => (useViewerStore.getState().underlayDrawings.get('rez-a')?.placement as { affine: number[] }).affine;

describe('posun rezu cez skutocny tok UNDERLAY_SAVE -> host -> UNDERLAYS_LOAD', () => {
  it('host po PATCH posle novy stav; nesuvisiaca sprava so starym stavom posun nezahodi', () => {
    const OLD = cal([K, 0, -2, 0, K, -1]);
    let hostState: unknown = OLD;
    const sent: OutboundMessage[] = [];
    wireDocumentEvents((m) => sent.push(m), () => {});
    handleDocumentMessage(load(OLD));

    const placement = { ...(useViewerStore.getState().underlayDrawings.get('rez-a')!.placement as object), affine: [K, 0, -1.5, 0, K, -1] };
    useViewerStore.getState().setUnderlayPlacement('rez-a', placement as never);
    const save = sent.find((m) => m.type === 'UNDERLAY_SAVE') as unknown as { documentId: string; georef: Record<string, unknown> };
    assert.equal(save.documentId, 'rez-a');
    assert.equal(save.georef.source, 'manual');

    // host este nestihol ulozit: nesuvisiaca sprava (napr. DOCUMENTS_LOAD/UNDERLAYS_LOAD) nesie stary stav
    handleDocumentMessage(load(hostState));
    assert.deepEqual(affineOf(), [K, 0, -1.5, 0, K, -1]);

    // PATCH dobehol, host posle ulozeny stav -> potvrdenie, poloha ostane
    hostState = save.georef;
    handleDocumentMessage(load(hostState));
    assert.deepEqual(affineOf(), [K, 0, -1.5, 0, K, -1]);

    // novy stav hosta (ina uprava inde) prevezme
    handleDocumentMessage(load(cal([K, 0, 7, 0, K, -1])));
    assert.deepEqual(affineOf(), [K, 0, 7, 0, K, -1]);
  });
});
