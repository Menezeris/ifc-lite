/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Import .bcfzip do DB AIM z BCF panela. Viewer nemá vlastný token: súbor pošle hostu správou `BCF_IMPORT`
 * (bajty ako ArrayBuffer) a host ho zapíše tou istou cestou ako import z chatu (rovnaké brány zápisu, origin
 * guard, rate limit). Najprv `dry_run: true` (súhrn bez zápisu), potom zápis s `dry_run: false`. Host odpovie
 * `BCF_IMPORTED` so súhrnom alebo chybou. Čistý tvar správ, bez importov zo storu.
 */

import { SOURCE } from './bridge-core.js';

/** Strop veľkosti súboru: limit funkcie Vercel na hoste. Väčší súbor sa importuje v chate (bcf_topic action=import). */
export const MAX_BCF_IMPORT_BYTES = 4_400_000;
/** Najviac upozornení v súhrne, ktoré viewer ukáže. */
export const MAX_IMPORT_WARNINGS = 20;

export interface BcfImportMessage {
  source: typeof SOURCE;
  type: 'BCF_IMPORT';
  /** Korelácia požiadavky s odpoveďou. */
  id: string;
  name: string;
  bytes: ArrayBuffer;
  dry_run: boolean;
}

export interface BcfImportSummary {
  dry_run: boolean;
  bcf_version: string;
  topics_in_file: number;
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  skipped: number;
  failed: number;
  warnings: string[];
}

export type BcfImportedMessage = { source?: typeof SOURCE; type: 'BCF_IMPORTED'; id: string } & (
  | { ok: true; summary: BcfImportSummary }
  | { ok: false; error: string }
);

const COUNTS = ['topics_in_file', 'created', 'updated', 'unchanged', 'conflicts', 'skipped', 'failed'] as const;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Odpoveď hosta, alebo null, keď tvar nesedí (správa sa zahodí). */
export function parseBcfImported(data: unknown): BcfImportedMessage | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.type !== 'BCF_IMPORTED' || !isText(m.id, 100)) return null;
  if (m.source !== undefined && m.source !== SOURCE) return null;
  const base = { type: 'BCF_IMPORTED', id: m.id } as const;
  if (m.ok === false) return isText(m.error, 2000) ? { ...base, ok: false, error: m.error } : null;
  const s = m.summary as Record<string, unknown> | null | undefined;
  if (m.ok !== true || !s || typeof s !== 'object') return null;
  if (typeof s.dry_run !== 'boolean' || typeof s.bcf_version !== 'string' || s.bcf_version.length > 20) return null;
  if (!COUNTS.every((k) => isCount(s[k]))) return null;
  let warnings: string[] = [];
  if (s.warnings !== undefined) {
    if (!Array.isArray(s.warnings) || !s.warnings.every((w) => typeof w === 'string' && w.length <= 500)) return null;
    warnings = (s.warnings as string[]).slice(0, MAX_IMPORT_WARNINGS);
  }
  return {
    ...base, ok: true,
    summary: {
      dry_run: s.dry_run, bcf_version: s.bcf_version,
      topics_in_file: s.topics_in_file as number, created: s.created as number, updated: s.updated as number,
      unchanged: s.unchanged as number, conflicts: s.conflicts as number, skipped: s.skipped as number,
      failed: s.failed as number, warnings,
    },
  };
}

/** Súbor vhodný na odoslanie: prípona a veľkosť (host ich overí znova). Vráti kód chyby alebo null. */
export function checkImportFile(name: string, size: number): 'extension' | 'empty' | 'tooLarge' | null {
  if (!/\.(bcfzip|bcf)$/i.test(name)) return 'extension';
  if (!Number.isFinite(size) || size <= 0) return 'empty';
  if (size > MAX_BCF_IMPORT_BYTES) return 'tooLarge';
  return null;
}
