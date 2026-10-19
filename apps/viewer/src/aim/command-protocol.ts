/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Potvrdenie príkazov a doplnky izolácie (AIM D-101, #97): host za príkazy
 * jedného volania pošle `ACK_REQUEST {cmdId}`, viewer ho vybaví v poradí po
 * nich, počká na ich asynchrónne kroky a odpovie `APPLIED` so stavom po
 * aplikovaní. `CLEAR_FOCUS` zruší oranžové zvýraznenie z `FOCUS` (#94),
 * `ISOLATE_ADD` / `ISOLATE_REMOVE` menia aktuálnu izoláciu (#95),
 * `CLEAR_SELECTION` zruší výber ako klik do prázdna (D-102). Samostatný
 * modul, lebo `bridge-protocol.ts` je na strope veľkosti.
 */

import { SOURCE, isInboundMessage, type OpsSelector } from './bridge-protocol.js';

/** Rovnaký strop ako `id` otázky (`QUERY`). */
const MAX_CMD_ID = 64;

export type CommandInboundMessage =
  | { source: typeof SOURCE; type: 'ACK_REQUEST'; cmdId: string }
  | { source: typeof SOURCE; type: 'CLEAR_FOCUS' }
  | { source: typeof SOURCE; type: 'CLEAR_SELECTION' }
  | { source: typeof SOURCE; type: 'ISOLATE_ADD' | 'ISOLATE_REMOVE'; guids?: string[]; selector?: OpsSelector };

/** Viewer -> host: príkazy pred `ACK_REQUEST` sú vykonané; `issues` = čo sa vykonať nedalo. */
export interface AppliedMessage {
  source: typeof SOURCE;
  type: 'APPLIED';
  cmdId: string;
  ok: boolean;
  issues: string[];
  state?: unknown;
}

const isCmdId = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= MAX_CMD_ID;

export function isCommandMessage(data: unknown): data is CommandInboundMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  if (m.source !== SOURCE) return false;
  switch (m.type) {
    case 'ACK_REQUEST':
      return isCmdId(m.cmdId);
    case 'CLEAR_FOCUS':
    case 'CLEAR_SELECTION':
      return true;
    case 'ISOLATE_ADD':
    case 'ISOLATE_REMOVE':
      // Cieľ ako pri ISOLATE (GUIDy alebo selektor) - tá istá kontrola; tu je povinný.
      return (m.selector !== undefined || (Array.isArray(m.guids) && m.guids.length > 0)) && isInboundMessage({ ...m, type: 'ISOLATE' });
    default:
      return false;
  }
}

/** Množina po ISOLATE_ADD / ISOLATE_REMOVE; bez aktuálnej izolácie pridanie = nová izolácia. */
export function nextIsolation(current: ReadonlySet<number> | null, ids: readonly number[], op: 'add' | 'remove'): number[] {
  if (op === 'add') return [...new Set([...(current ?? []), ...ids])];
  if (!current) return [];
  const drop = new Set(ids);
  return [...current].filter((id) => !drop.has(id));
}
