/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Upload queued streaming geometry before a pick reads the scene.
 *
 * The animation loop drains the mesh queue a few milliseconds per frame, and
 * that drain outlives `geometryStreamingActive`: the pick gate opens when the
 * stream ends, while part of the model can still be queued or only partly
 * uploaded. `Scene.addMeshData` runs at upload, so a tap in that window sees a
 * scene without those elements and selects nothing (a user tapping right after
 * a load, on a phone where the drain is slow). The pick itself renders its own
 * pass for the current camera, so the queue is the only thing missing.
 */
export interface PickPreflightHost {
  /** True while the scene still holds queued, not yet uploaded meshes. */
  hasQueued: () => boolean;
  /** Upload one budgeted slice; returns whether anything was uploaded. A contained upload failure returns false. */
  flushSlice: () => boolean;
  /** Called once after the drain uploaded something (renderer caches are stale). */
  onFlushed: () => void;
  now?: () => number;
}

/** Longest a single pick waits for the queue; a tap must stay responsive. */
export const PICK_PREFLIGHT_MAX_MS = 250;

export function createPickPreflight(host: PickPreflightHost, maxMs = PICK_PREFLIGHT_MAX_MS): () => void {
  const now = host.now ?? (() => performance.now());
  return () => {
    if (!host.hasQueued()) return;
    const deadline = now() + maxMs;
    let flushedAny = false;
    while (host.hasQueued() && now() < deadline) {
      if (!host.flushSlice()) break;
      flushedAny = true;
    }
    if (flushedAny) host.onFlushed();
  };
}
