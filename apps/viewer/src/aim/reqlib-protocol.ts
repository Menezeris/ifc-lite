/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Knižnica požiadaviek (AIM D-182, #351): karta "Requirements library" sa pýta hosta jedným párom správ.
 * Host číta repo knižnice a DB AIM (`/api/ids/library`, `/models`, `/runs`); viewer nič nepočíta ani neukladá.
 *
 * Viewer -> host: `REQLIB_REQUEST {id, action, payload}`
 *  - `catalog` {}: hotové IDS v knižnici so stavom voči AIM a IDS v projekte (história, modely, výsledky);
 *  - `assign` {path, commit, sha256, author, continue_code?, as_new?}: "Priradiť k projektu";
 *  - `bind` {code, model, bound, author}: ručná väzba IDS na model federácie;
 *  - `open` {code, version, target}: host pošle existujúci `IDS_LOAD` do IDS Studia alebo Data validation;
 *  - `save_run` {code, version, ids_sha256, engine_version, author, runs: [{model_id, model_name, specs}]}:
 *    výsledok kontroly z panela validácie (beží raz, vo vieweri; host ho uloží s revíziou, ktorú viewer načítal).
 * Host -> viewer: `REQLIB_RESULT {id, ok, data?, error?}`.
 */

import { SOURCE } from './bridge-core.js';

export const REQLIB_ACTIONS = ['catalog', 'assign', 'bind', 'open', 'save_run'] as const;
export type ReqlibAction = (typeof REQLIB_ACTIONS)[number];

export interface ReqlibRequestMessage {
  source: typeof SOURCE;
  type: 'REQLIB_REQUEST';
  id: string;
  action: ReqlibAction;
  payload: Record<string, unknown>;
}

export interface ReqlibResultMessage {
  source: typeof SOURCE;
  type: 'REQLIB_RESULT';
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function buildReqlibRequest(id: string, action: ReqlibAction, payload: Record<string, unknown>): ReqlibRequestMessage {
  return { source: SOURCE, type: 'REQLIB_REQUEST', id, action, payload };
}

/** Odpoveď hosta (overí tvar). */
export function isReqlibResult(data: unknown): data is ReqlibResultMessage {
  if (!isObj(data) || data.source !== SOURCE || data.type !== 'REQLIB_RESULT') return false;
  if (typeof data.id !== 'string' || !data.id || data.id.length > 100 || typeof data.ok !== 'boolean') return false;
  return data.error === undefined || (typeof data.error === 'string' && data.error.length <= 4000);
}
