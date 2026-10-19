/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM_BCF_LOAD (AIM D-099): the host points the viewer at its BCF API 2.1
 * (`<host>/api/bcf`) and project; the viewer pulls the topics with the
 * upstream client (`@ifc-lite/bcf-api` fetchProjectAsBCF) without a token,
 * so BCF topics written from the AIM chat show up in the BCF panel on their
 * own. The host sends it after MODELS_LOADED and again after every change.
 */

import { SOURCE } from './bridge-protocol.js';

export interface BcfLoadMessage {
  source: typeof SOURCE;
  type: 'AIM_BCF_LOAD';
  /** BCF API base URL (without the version segment), on the host's origin. */
  baseUrl: string;
  projectId: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A valid AIM_BCF_LOAD whose API lives on the parent's own origin. The origin
 * check keeps a compromised or misconfigured host message from pointing the
 * viewer's fetches at a third-party server.
 */
export function isBcfLoadMessage(data: unknown, parentOrigin: string | null): data is BcfLoadMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as { source?: unknown; type?: unknown; baseUrl?: unknown; projectId?: unknown };
  if (msg.source !== SOURCE || msg.type !== 'AIM_BCF_LOAD') return false;
  if (typeof msg.projectId !== 'string' || msg.projectId.length === 0 || msg.projectId.length > 100) return false;
  if (typeof msg.baseUrl !== 'string') return false;
  let url: URL;
  try {
    url = new URL(msg.baseUrl);
  } catch {
    return false;
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  if (!secure || url.username || url.password) return false;
  return parentOrigin === null || url.origin === parentOrigin;
}
