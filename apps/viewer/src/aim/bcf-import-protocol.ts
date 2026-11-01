/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Import .bcfzip do DB AIM z BCF panela. Viewer nemá vlastný token: súbor pošle hostu správou `BCF_IMPORT`
 * (bajty ako ArrayBuffer) a host ho zapíše tou istou cestou ako import z AIM (rovnaké brány zápisu, origin guard,
 * rate limit). Host odpovie `BCF_IMPORTED` s počtami alebo chybou. Čistý tvar správ, bez importov zo storu.
 */

import { SOURCE } from './bridge-core.js';

/** Strop veľkosti súboru; má sa zhodovať s limitom hosta (POST /api/bcf/import), host ho aj tak overí. */
export const MAX_BCF_IMPORT_BYTES = 20 * 1024 * 1024;
/** Najviac chýb v odpovedi, ktoré viewer ukáže. */
export const MAX_IMPORT_ERRORS = 20;

export interface BcfImportMessage {
  source: typeof SOURCE;
  type: 'BCF_IMPORT';
  requestId: string;
  filename: string;
  bytes: ArrayBuffer;
}

export type BcfImportedMessage = { source: typeof SOURCE; type: 'BCF_IMPORTED'; requestId: string } & (
  | { ok: true; created: number; unchanged: number; updated: number; errors: string[] }
  | { ok: false; error: string }
);

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Odpoveď hosta, alebo null, keď tvar nesedí (správa sa zahodí). */
export function parseBcfImported(data: unknown): BcfImportedMessage | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.source !== SOURCE || m.type !== 'BCF_IMPORTED' || !isText(m.requestId, 100)) return null;
  const base = { source: SOURCE, type: 'BCF_IMPORTED', requestId: m.requestId } as const;
  if (m.ok === false) return isText(m.error, 2000) ? { ...base, ok: false, error: m.error } : null;
  if (m.ok !== true || !isCount(m.created) || !isCount(m.unchanged) || !isCount(m.updated)) return null;
  let errors: string[] = [];
  if (m.errors !== undefined) {
    if (!Array.isArray(m.errors) || !m.errors.every((e) => isText(e, 500))) return null;
    errors = (m.errors as string[]).slice(0, MAX_IMPORT_ERRORS);
  }
  return { ...base, ok: true, created: m.created, unchanged: m.unchanged, updated: m.updated, errors };
}

/** Súbor vhodný na odoslanie: prípona a veľkosť (host ich overí znova). Vráti kód chyby alebo null. */
export function checkImportFile(name: string, size: number): 'extension' | 'empty' | 'tooLarge' | null {
  if (!/\.(bcfzip|bcf)$/i.test(name)) return 'extension';
  if (size <= 0) return 'empty';
  if (size > MAX_BCF_IMPORT_BYTES) return 'tooLarge';
  return null;
}
