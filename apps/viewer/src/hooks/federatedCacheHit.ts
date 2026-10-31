/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Persisted cache for a FEDERATED add (opt-in, `ModelLoadOptions.federatedCache`).
 *
 * A primary hit streams the entry into the active slot; a federated add must
 * never touch it (model #1 stays as it is), so its hit decodes into a
 * {@link FederatedCacheHit} and joins the federation through the same
 * `finalizeModel` a fresh parse uses (alignment, id offset, addModel).
 *
 * Two things differ from a primary entry and both live here:
 *  - The meshes of a federated add are tessellated relative to the federation's
 *    shared RTC origin, so the origin is part of the key ({@link federatedCacheKey}).
 *    Without it a model cached beside one anchor would be served beside another,
 *    offset by the difference. No shared origin (the first model) keeps the
 *    primary key, so a primary entry serves a first federated add and back.
 *  - A published federated model cannot be reloaded in place, so the full-source
 *    hash is checked BEFORE serving ({@link federatedHitIsCurrent}) instead of
 *    the primary's purge-and-reload afterwards. It costs no extra pass: the hash
 *    is the load's own identity, which `finalizeModel` awaits anyway.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import type { CoordinateInfo, GeometryResult, MeshData } from '@ifc-lite/geometry';
import { calculateMeshBounds, createCoordinateInfo } from '../utils/localParsingUtils.js';

/** What a federated cache hit decodes into, instead of the active slot. */
export interface FederatedCacheHit {
  meshes: MeshData[];
  shards: ArrayBuffer[];
  dataStore: IfcDataStore | null;
  coordinateInfo?: CoordinateInfo;
}

export function createFederatedCacheHit(): FederatedCacheHit {
  return { meshes: [], shards: [], dataStore: null };
}

/**
 * The store writes `loadFromCache` makes, redirected into `hit`. Same names and
 * signatures as the store actions, so the cache reader runs unchanged.
 */
export function federatedCacheSink(hit: FederatedCacheHit) {
  return {
    // `null` is the reader's rollback after a corrupt chunk: drop what was collected.
    setGeometryResult: (result: GeometryResult | null) => { if (result === null) hit.meshes.length = 0; },
    setGeometryStreamingActive: (_active: boolean) => {},
    appendGeometryBatch: (_modelId: string, meshes: MeshData[], coordinateInfo?: CoordinateInfo) => {
      for (const mesh of meshes) hit.meshes.push(mesh);
      if (coordinateInfo) hit.coordinateInfo = coordinateInfo;
    },
    appendInstancedShards: (_modelId: string, shards: ArrayBuffer[]) => { for (const s of shards) hit.shards.push(s); },
    setIfcDataStore: (dataStore: IfcDataStore | null) => { hit.dataStore = dataStore; },
    /** The cold-geometry provider serves the primary's entry only. */
    coldTier: false,
  };
}

/** The decoded hit as the `finalizeModel` inputs a fresh federated parse builds. */
export function federatedHitModel(
  hit: FederatedCacheHit,
  // Instancing-only elements' hashes, boxes and volumes: kept beside the entry, not in its binary format.
  instanced?: Pick<GeometryResult, 'instancedGeometryHashes' | 'instancedGeometryAabbs' | 'instancedGeometryVolumes'>,
): { ifcDataStore: IfcDataStore | null; geometryResult: GeometryResult } {
  let totalVertices = 0;
  let totalTriangles = 0;
  for (const mesh of hit.meshes) {
    totalVertices += mesh.positions.length / 3;
    totalTriangles += mesh.indices.length / 3;
  }
  const coordinateInfo = hit.coordinateInfo ?? createCoordinateInfo(calculateMeshBounds(hit.meshes).bounds);
  const maps = {
    ...(instanced?.instancedGeometryHashes ? { instancedGeometryHashes: instanced.instancedGeometryHashes } : {}),
    ...(instanced?.instancedGeometryAabbs ? { instancedGeometryAabbs: instanced.instancedGeometryAabbs } : {}),
    ...(instanced?.instancedGeometryVolumes ? { instancedGeometryVolumes: instanced.instancedGeometryVolumes } : {}),
  };
  return { ifcDataStore: hit.dataStore, geometryResult: { meshes: hit.meshes, totalVertices, totalTriangles, coordinateInfo, ...maps } };
}

/**
 * Cache key of a federated add: the primary key plus the shared RTC origin it
 * was tessellated against, in whole millimetres (the key stays `[A-Za-z0-9_-]`
 * for the desktop cache).
 */
export function federatedCacheKey(baseKey: string, sharedRtcOffset?: { x: number; y: number; z: number }): string {
  if (!sharedRtcOffset) return baseKey;
  const mm = (v: number) => String(Math.round(v * 1000));
  return `${baseKey}-r${mm(sharedRtcOffset.x)}_${mm(sharedRtcOffset.y)}_${mm(sharedRtcOffset.z)}`;
}

/**
 * Whether a federated hit may be served given the stored full-source hash: yes
 * when nothing asks for revalidation, or when the fresh identity matches. An
 * unavailable fresh identity (no Web Crypto) serves, as a primary hit does: the
 * mtime guard has already vetted the entry.
 */
export async function federatedHitIsCurrent(
  identity: Promise<string | undefined>,
  expectedHash: string | undefined,
): Promise<boolean> {
  if (!expectedHash) return true;
  const fresh = await identity;
  return !fresh || fresh === expectedHash;
}
