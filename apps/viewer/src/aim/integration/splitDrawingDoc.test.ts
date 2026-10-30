/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { useViewerStore } from '@/store';
import { splitWithDrawing } from '../viewTabsApply.js';

const doc = (id: string, kind: 'drawing' | 'document', storeyGuid: string | null) => ({ id, name: id, kind, url: `https://x/${id}.pdf`, storeyGuid });
const STOREY = 'storey-1';
let issues: string[];
const note = (m: string) => void issues.push(m);
const opened = () => useViewerStore.getState().activeDocTabId;

beforeEach(() => {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
  issues = [];
  useViewerStore.getState().setViewerDocuments([
    doc('pbr', 'drawing', STOREY), doc('asr', 'drawing', null), doc('text', 'document', null),
  ] as never);
  useViewerStore.setState({ activeDocTabId: null });
});

describe('split s výkresom od hosta (AIM D-176)', () => {
  it('documentId od hosta má prednosť pred výberom podľa podlažia', async () => {
    await splitWithDrawing(STOREY, note, 'asr');
    assert.equal(opened(), 'asr');
    assert.deepEqual(issues, []);
  });

  it('bez documentId ostáva výber podľa podlažia', async () => {
    await splitWithDrawing(STOREY, note);
    assert.equal(opened(), 'pbr');
  });

  it('neznámy alebo nie-výkres documentId ide do issues a viewer padne späť na výber podľa podlažia', async () => {
    await splitWithDrawing(STOREY, note, 'nikde');
    assert.equal(opened(), 'pbr');
    assert.match(issues[0], /nie je v knižnici/);
    await splitWithDrawing(STOREY, note, 'text');
    assert.match(issues[1], /nie je výkres/);
  });
});
