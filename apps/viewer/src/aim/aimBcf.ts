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
import { mergeAimProject, type AimDocumentReference } from './docIssueModel.js';
import { normalizeMarkup } from './docMarkup.js';

type BcfApi = Pick<typeof import('@ifc-lite/bcf-api'), 'BcfApiClient' | 'fetchProjectAsBCF'>;

export interface AimBcfDeps {
  getProject: () => BCFProject | null;
  setProject: (project: BCFProject) => void;
  /** The caller's `import('@ifc-lite/bcf-api')`: a dynamic import here would make
   * vite-plugin-top-level-await rewrite this chunk (scripts/check-tla-chunk-await.mjs). */
  loadApi: () => Promise<BcfApi>;
  /** Document references of a topic (AIM D-158); the upstream client has no call for them. */
  fetchFn?: typeof fetch;
}

/** Marker the host puts in a topic description when the topic has document references (AIM D-158). */
export const DOCUMENTS_HEADING = 'Dokumenty (AIM):';

/**
 * Document references (AIM D-158) of the host topics that have some: the BCF
 * panel and the PDF frames read them from the topic, and an export carries them.
 * Only topics whose description lists documents are asked; a failure leaves the
 * topic without them (the description still names the document and page).
 */
async function attachDocumentReferences(project: BCFProject, msg: BcfLoadMessage, fetchFn: typeof fetch): Promise<void> {
  const base = msg.baseUrl.replace(/\/+$/, '');
  const wanted = [...project.topics.values()].filter((t) => t.description?.includes(DOCUMENTS_HEADING));
  await Promise.all(wanted.map(async (topic) => {
    try {
      const url = `${base}/2.1/projects/${encodeURIComponent(msg.projectId)}/topics/${encodeURIComponent(topic.guid)}/document_references`;
      const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const rows = (await res.json()) as unknown;
      if (!Array.isArray(rows)) return;
      const refs: AimDocumentReference[] = [];
      for (const r of rows as Record<string, unknown>[]) {
        if (typeof r?.url !== 'string') continue;
        // AIM #199: značky z `model_task_documents.markup` (starší host pole nemá).
        const markup = normalizeMarkup(r.markup);
        refs.push({
          ...(markup.length ? { markup } : {}),
          ...(typeof r.guid === 'string' ? { guid: r.guid } : {}),
          url: r.url,
          referencedDocument: r.url,
          isExternal: true,
          ...(typeof r.description === 'string' ? { description: r.description } : {}),
        });
      }
      if (refs.length) topic.documentReferences = refs;
    } catch (err) {
      console.warn('[aim-bridge] AIM_BCF_LOAD: document references', topic.guid, err);
    }
  }));
}

let lastLoaded: BCFProject | null = null;
let generation = 0;

/** 'loaded' | 'kept' (user's own project stays) | 'stale' (a newer load won). */
export async function loadAimBcfTopics(
  msg: BcfLoadMessage,
  deps: AimBcfDeps,
): Promise<'loaded' | 'kept' | 'stale'> {
  const mine = ++generation;
  const api = await deps.loadApi();
  const client = new api.BcfApiClient({ baseUrl: msg.baseUrl });
  // The host serves a snapshot only for document references (the page region with its frame,
  // AIM D-158 step 3); viewpoints without one are not probed, so the panel and the .bcfzip
  // export get the PDF picture of each saved issue.
  const result = await api.fetchProjectAsBCF(client, msg.projectId, { includeSnapshots: true });
  if (mine !== generation) return 'stale';
  if (result.warnings.length > 0) console.warn('[aim-bridge] AIM_BCF_LOAD:', result.warnings);
  const fetchFn = deps.fetchFn ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (fetchFn) await attachDocumentReferences(result.project, msg, fetchFn);
  if (mine !== generation) return 'stale';
  // AIM D-158: topics added in the panel (not saved yet) stay; saved ones come back from the host.
  const next = mergeAimProject(deps.getProject(), result.project, lastLoaded);
  if (!next) {
    console.warn('[aim-bridge] AIM_BCF_LOAD: the open BCF project is the user\'s own, AIM topics not loaded');
    return 'kept';
  }
  deps.setProject(next);
  lastLoaded = next;
  return 'loaded';
}
