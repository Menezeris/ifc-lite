/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import type { EntityWorldAabb, MeshData } from '@ifc-lite/geometry';
import { getCached, setCached, deleteCached } from '../services/ifc-cache.js';
import { createFederatedCacheHit, federatedCacheKey, federatedCacheSink, federatedHitIsCurrent, federatedHitModel } from './federatedCacheHit.js';

// AIM #308: the persisted cache of a federated add (the end-to-end run is
// useIfcLoader.federatedCache.real-ifc.test.tsx).

describe('federatedCacheKey', () => {
  it('a model without a shared origin keeps the primary key, so either load serves the other', () => {
    assert.equal(federatedCacheKey('ifc-1-ab-v13-g6'), 'ifc-1-ab-v13-g6');
  });

  it('meshes tessellated against another origin never share a key, and stay desktop-safe', () => {
    const a = federatedCacheKey('k', { x: 1.5, y: -2, z: 0.25 });
    assert.equal(a, 'k-r1500_-2000_250');
    assert.notEqual(federatedCacheKey('k', { x: 1.501, y: -2, z: 0.25 }), a);
    assert.equal(federatedCacheKey('k', { x: 1.5000001, y: -2, z: 0.25 }), a, 'sub-millimetre float noise');
    assert.match(federatedCacheKey('k', { x: -651234.875, y: 5432109.5, z: 0 }), /^[A-Za-z0-9_-]+$/);
  });
});

describe('federatedHitIsCurrent', () => {
  it('serves only when the fresh identity matches, or when there is nothing to compare', async () => {
    assert.equal(await federatedHitIsCurrent(Promise.resolve('h1'), 'h1'), true);
    assert.equal(await federatedHitIsCurrent(Promise.resolve('h2'), 'h1'), false);
    assert.equal(await federatedHitIsCurrent(Promise.resolve(undefined), 'h1'), true);
    assert.equal(await federatedHitIsCurrent(new Promise(() => {}), undefined), true);
  });
});

describe('instancing-only elements across a federated hit', () => {
  // The binary cache has no section for them; without these maps a warm open drops
  // their boxes (zoom, section through an element), volumes and hashes, and the
  // element count falls (BURKWIL: 3.2K fresh vs 2.8K from the cache before the fix).
  const box = { min: [0, 0, 0], max: [1, 2, 3] } as unknown as EntityWorldAabb;
  const maps = {
    instancedGeometryHashes: new Map([[42, 123456789012345n]]),
    instancedGeometryAabbs: new Map([[42, box]]),
    instancedGeometryVolumes: new Map([[42, 6]]),
  };

  it('ride beside the IndexedDB entry and come back as Maps', async () => {
    await setCached('ifc-8-x-v13-g6', new ArrayBuffer(8), 'ASR.ifc', 8, undefined, { lastModified: 78, instancedGeometry: maps });
    const back = await getCached('ifc-8-x-v13-g6');
    assert.deepEqual(back?.instancedGeometry, maps);
    await deleteCached('ifc-8-x-v13-g6');
  });

  it('persist only the three maps even when handed a whole GeometryResult (follow-up #182)', async () => {
    const whole = { ...maps, meshes: [{ expressId: 1, positions: new Float32Array(9), indices: new Uint32Array(3) }], totalVertices: 3 } as unknown as typeof maps;
    await setCached('ifc-8-y-v13-g6', new ArrayBuffer(8), 'ASR.ifc', 8, undefined, { lastModified: 78, instancedGeometry: whole });
    const back = await getCached('ifc-8-y-v13-g6');
    assert.deepEqual(Object.keys(back?.instancedGeometry ?? {}).sort(), ['instancedGeometryAabbs', 'instancedGeometryHashes', 'instancedGeometryVolumes']);
    await deleteCached('ifc-8-y-v13-g6');
  });

  it('reach the model the hit publishes, beside the decoded meshes', () => {
    const hit = createFederatedCacheHit();
    const mesh = { expressId: 7, positions: new Float32Array(9), indices: new Uint32Array(3) } as unknown as MeshData;
    federatedCacheSink(hit).appendGeometryBatch('m', [mesh]);
    const { geometryResult } = federatedHitModel(hit, maps);
    assert.equal(geometryResult.meshes.length, 1);
    assert.equal(geometryResult.totalTriangles, 1);
    assert.equal(geometryResult.instancedGeometryAabbs, maps.instancedGeometryAabbs);
    assert.equal(geometryResult.instancedGeometryVolumes, maps.instancedGeometryVolumes);
    assert.equal(geometryResult.instancedGeometryHashes, maps.instancedGeometryHashes);
  });
});
