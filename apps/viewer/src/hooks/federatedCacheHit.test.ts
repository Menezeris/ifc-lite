/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { federatedCacheKey, federatedHitIsCurrent } from './federatedCacheHit.js';

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
