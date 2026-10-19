/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM_BCF_LOAD glue (AIM D-099), loaded on first use: pull the host's BCF
 * topics with the upstream client and hand them to the BCF panel's store.
 * Reads go without a token (the AIM host serves them read-only); writing
 * stays with the chat, or with the panel's own server connection. Store
 * access is passed in by the bridge so this module imports nothing the
 * entry does.
 */

import type { BCFProject } from '@ifc-lite/bcf';
import type { BcfLoadMessage } from './bcf-protocol.js';

type BcfApi = Pick<typeof import('@ifc-lite/bcf-api'), 'BcfApiClient' | 'fetchProjectAsBCF'>;

export interface AimBcfDeps {
  getProject: () => BCFProject | null;
  setProject: (project: BCFProject) => void;
  loadApi?: () => Promise<BcfApi>;
}

/**
 * Replace the viewer's BCF project with the host's topics only when that
 * cannot lose the user's own work: no project yet, an empty one, or the one
 * the previous AIM_BCF_LOAD put there. A project the user opened from a file
 * or a server connection stays.
 */
export function shouldReplaceBcfProject<P extends { topics: { size: number } }>(
  current: P | null,
  lastLoaded: P | null,
): boolean {
  return current === null || current === lastLoaded || current.topics.size === 0;
}

let lastLoaded: BCFProject | null = null;
let generation = 0;

/** 'loaded' | 'kept' (user's own project stays) | 'stale' (a newer load won). */
export async function loadAimBcfTopics(
  msg: BcfLoadMessage,
  deps: AimBcfDeps,
): Promise<'loaded' | 'kept' | 'stale'> {
  const mine = ++generation;
  const api = await (deps.loadApi ?? (() => import('@ifc-lite/bcf-api')))();
  const client = new api.BcfApiClient({ baseUrl: msg.baseUrl });
  // Snapshots are not served by the AIM host yet; skip the per-viewpoint probes.
  const result = await api.fetchProjectAsBCF(client, msg.projectId, { includeSnapshots: false });
  if (mine !== generation) return 'stale';
  if (result.warnings.length > 0) console.warn('[aim-bridge] AIM_BCF_LOAD:', result.warnings);
  if (!shouldReplaceBcfProject(deps.getProject(), lastLoaded)) {
    console.warn('[aim-bridge] AIM_BCF_LOAD: the open BCF project is the user\'s own, AIM topics not loaded');
    return 'kept';
  }
  deps.setProject(result.project);
  lastLoaded = result.project;
  return 'loaded';
}
