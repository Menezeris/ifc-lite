/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft, getLinkDraft, onLinkDraftChange, regionToPct, setLinkDraft } from './docLinkDraftStore.js';

const ctx = { docId: 'doc-1', page: 2 };

describe('buildDraft (AIM D-160)', () => {
  it('prevedie zlomky strany na percentá a zachová akciu', () => {
    const d = buildDraft(ctx, { x: 0.1234, y: 0.2, w: 0.05, h: 0.01 }, 'assign', ' PU N1.01 ');
    assert.deepEqual(d, {
      document_id: 'doc-1',
      page: 2,
      text: 'PU N1.01',
      bbox: { x: 12.34, y: 20, width: 5, height: 1 },
      action: 'assign',
    });
  });

  it('prázdny text je null (text určí host z riadkov strany)', () => {
    assert.equal(buildDraft(ctx, { x: 0, y: 0, w: 0.1, h: 0.1 }, 'assign', '  ').text, null);
    assert.equal(buildDraft(ctx, { x: 0, y: 0, w: 0.1, h: 0.1 }, 'clear', null).text, null);
  });

  it('regionToPct zaokrúhli na dve desatinné miesta', () => {
    assert.deepEqual(regionToPct({ x: 0.123456, y: 0, w: 0.5, h: 0.000999 }), { x: 12.35, y: 0, width: 50, height: 0.1 });
  });
});

describe('návrh vo store', () => {
  it('set/get/clear a oznámenie zmeny', () => {
    let calls = 0;
    const off = onLinkDraftChange(() => calls++);
    const d = buildDraft(ctx, { x: 0, y: 0, w: 0.1, h: 0.1 }, 'reset', 'x');
    setLinkDraft(d);
    assert.equal(getLinkDraft(), d);
    setLinkDraft(null);
    assert.equal(getLinkDraft(), null);
    off();
    setLinkDraft(d);
    assert.equal(calls, 2);
    setLinkDraft(null);
  });
});
