/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import 'fake-indexeddb/auto';
import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { Blob as NativeBlob } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { act } from 'react';
import { computeSourceFingerprint } from '@ifc-lite/cache';
import { getCached, setCached, deleteCached } from '@/services/cacheService.js';
import { useViewerStore, type FederatedModel } from '@/store';
import { resolveLoadTessellationTier } from '@/store/constants.js';
import { buildGeometryCacheKey } from './geometryCacheKey.js';
import { federatedCacheKey } from './federatedCacheHit.js';
import type { ModelLoadOptions } from './modelLoadOptions.js';
import * as harness from '@/test/blank-ifc-loader-harness.js';
import { installRealCacheCompressionTransport } from '@/test/cache-compression-transport.js';

// AIM #308: a federated add (every model of the AIM `?models=` autoload) reads and
// writes the parsed-model cache when it opts in, so the next open of the same
// revision skips parse + tessellation. Real FZK-Haus, real WASM, real codec.

// Preserve the actual persisted payload across fake-indexeddb's Blob clone.
const priorBlob = globalThis.Blob;
Reflect.set(globalThis, 'Blob', NativeBlob);
after(() => { Reflect.set(globalThis, 'Blob', priorBlob); });
const fixture = new URL('../../../../tests/models/ara3d/AC20-FZK-Haus.ifc', import.meta.url);
const skip = !existsSync(fixture) ? 'Run pnpm fixtures for the FZK-Haus federated cache (AIM #308).' : harness.skip;
const OPT_IN: ModelLoadOptions = { federatedCache: { minSize: 0 } };

function baseKey(bytes: Uint8Array): string {
  const state = useViewerStore.getState();
  return buildGeometryCacheKey(bytes.length, computeSourceFingerprint(bytes).hex,
    state.mergeLayers, undefined, state.geometryMode === 'fast',
    resolveLoadTessellationTier(bytes.length / (1024 * 1024), state.geometryMode));
}

async function addFederated(file: File, modelId: string, options?: ModelLoadOptions,
  sharedRtcOffset?: { x: number; y: number; z: number }): Promise<FederatedModel> {
  assert.ok(harness.hook);
  await act(async () => harness.hook?.loadFile(file, { kind: 'federated', modelId, sharedRtcOffset }, options));
  const model = useViewerStore.getState().models.get(modelId);
  assert.ok(model, 'federated model registered');
  assert.ok(model.ifcDataStore && model.geometryResult);
  return model;
}

/** Element ids as the file numbers them, whatever offset the federation gave the model. */
function localIds(model: FederatedModel): number[] {
  return model.geometryResult!.meshes.map((m) => m.expressId - model.idOffset).sort((a, b) => a - b);
}

it('AIM #308 an opted-in federated add writes the cache and the next add of the same file is served from it',
  { skip }, async () => {
    const bytes = new Uint8Array(readFileSync(fixture));
    const file = new File([bytes.buffer], 'AC20-FZK-Haus.ifc', { lastModified: 78 });
    const key = baseKey(bytes);
    const transport = installRealCacheCompressionTransport();
    try {
      await deleteCached(key);
      // Opted out (upstream default): a federated add stays WASM-only and writes nothing.
      const plain = await addFederated(file, 'plain');
      assert.equal(plain.loadPath, 'wasm');
      assert.equal(await getCached(key), null, 'no federated write without the opt-in');

      useViewerStore.getState().clearAllModels();
      const fresh = await addFederated(file, 'fresh', OPT_IN);
      assert.equal(fresh.loadPath, 'wasm');
      // Written before finalize: on return the entry is there, with this load's mtime.
      const entry = await getCached(key);
      assert.ok(entry, 'federated write completed before the add resolved');
      assert.equal(entry.lastModified, 78);

      // A second federated model on top (the AIM case: VZT after ASR) is a hit too.
      const hit = await addFederated(file, 'hit', OPT_IN);
      assert.equal(hit.loadPath, 'cache');
      assert.ok(hit.idOffset > fresh.idOffset, 'the hit joined the federation with its own id range');
      assert.equal(hit.geometryResult!.meshes.length, fresh.geometryResult!.meshes.length);
      assert.equal(hit.geometryResult!.totalTriangles, fresh.geometryResult!.totalTriangles);
      assert.deepEqual(localIds(hit), localIds(fresh));
      assert.equal(hit.ifcDataStore!.entityCount, fresh.ifcDataStore!.entityCount);
      // The first model is untouched by the second one's hit (no write into the active slot).
      assert.equal(useViewerStore.getState().models.get('fresh')?.geometryResult?.meshes.length,
        fresh.geometryResult!.meshes.length);
    } finally {
      await transport.dispose();
      await deleteCached(key);
    }
  });

it('AIM #308 a federated entry is keyed by the shared RTC origin and checked against the full hash before serving',
  { skip }, async () => {
    const bytes = new Uint8Array(readFileSync(fixture));
    const file = new File([bytes.buffer], 'AC20-FZK-Haus.ifc', { lastModified: 78 });
    const offset = { x: 1.5, y: -2, z: 0.25 };
    const key = federatedCacheKey(baseKey(bytes), offset);
    const transport = installRealCacheCompressionTransport();
    try {
      await deleteCached(baseKey(bytes));
      await deleteCached(key);
      const fresh = await addFederated(file, 'anchored', OPT_IN, offset);
      assert.equal(fresh.loadPath, 'wasm');
      assert.ok(await getCached(key), 'entry under the RTC-qualified key');
      assert.equal(await getCached(baseKey(bytes)), null, 'not under the key of a model without that origin');

      // Same length, same sampled fingerprint, same mtime, different full content:
      // the stored hash no longer matches the fresh identity -> miss, reparse.
      const entry = await getCached(key);
      assert.ok(entry?.fullSourceHash);
      const buffer = entry.buffer instanceof Blob ? await entry.buffer.arrayBuffer() : entry.buffer;
      await setCached(key, buffer, 'AC20-FZK-Haus.ifc', bytes.length, entry.sourceBuffer,
        { lastModified: 78, fullSourceHash: `${entry.fullSourceHash.slice(0, -4)}0000` });
      const stale = await addFederated(file, 'stale', OPT_IN, offset);
      assert.equal(stale.loadPath, 'wasm', 'a hash mismatch is never served');
      const rewritten = await getCached(key);
      assert.equal(rewritten?.fullSourceHash, entry.fullSourceHash, 'the reparse rewrote a valid entry');
    } finally {
      await transport.dispose();
      await deleteCached(key);
    }
  });
