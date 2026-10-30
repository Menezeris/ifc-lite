/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'fake-indexeddb/auto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCacheStats, setCached, clearCache } from '../services/ifc-cache.js';
import { keyFileSize, pruneModelCache, staleRevisionKeys } from './cachePrune.js';

// AIM #308: revízie modelu z AIM sa v cache nehromadia.

describe('staleRevisionKeys', () => {
  it('keeps the current revision (same size) and the newest other one', () => {
    const entries = [
      { key: 'a', fileSize: 100, createdAt: 1 },
      { key: 'b', fileSize: 200, createdAt: 2 },
      { key: 'c', fileSize: 300, createdAt: 3 },
      { key: 'd', fileSize: 400, createdAt: 4 },
      { key: 'd-ml', fileSize: 400, createdAt: 5 },
    ];
    assert.deepEqual(staleRevisionKeys(entries, 400), ['b', 'a']);
    assert.deepEqual(staleRevisionKeys(entries, 100), ['c', 'b'], 'reopening an old revision keeps it and both entries of the newest');
  });

  it('reads the source size from the viewer cache key', () => {
    assert.equal(keyFileSize('ifc-9976176-abc-v13-g6-sc'), 9976176);
    assert.equal(keyFileSize('ifc-9976176-abc-v13-g6-r1500_-2000_250'), 9976176);
    assert.equal(keyFileSize('other'), null);
  });
});

describe('pruneModelCache against the real cache service', () => {
  it('deletes older revisions of the loaded model only', async () => {
    await clearCache();
    const put = (key: string, name: string, size: number) => setCached(key, new ArrayBuffer(8), name, size);
    await put('ifc-100-x-v13-g6', 'ASR.ifc', 100);
    await new Promise((r) => setTimeout(r, 5));
    await put('ifc-200-x-v13-g6', 'ASR.ifc', 200);
    await new Promise((r) => setTimeout(r, 5));
    await put('ifc-300-x-v13-g6', 'ASR.ifc', 300);
    await put('ifc-100-y-v13-g6', 'VZT.ifc', 100);
    const removed = await pruneModelCache([{ fileName: 'ASR.ifc', fileSize: 300 }]);
    assert.equal(removed, 1);
    const left = (await getCacheStats()).entries.map((e) => `${e.fileName}:${e.fileSize}`).sort();
    assert.deepEqual(left, ['ASR.ifc:200', 'ASR.ifc:300', 'VZT.ifc:100']);
  });
});
