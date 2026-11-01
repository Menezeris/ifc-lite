/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Importovať do AIM" v BCF paneli (lenivý modul): pošle súbor hostu (`BCF_IMPORT`) a čaká na `BCF_IMPORTED`.
 * Kontrola B2 (s labelmi). Jedna požiadavka naraz; odpoveď bez zodpovedajúceho `requestId` sa zahodí.
 */

import { SOURCE } from './bridge-core.js';
import { idsHostPost } from './idsHost.js';
import { checkImportFile, parseBcfImported, type BcfImportedMessage, type BcfImportMessage, type BcfImportSummary } from './bcf-import-protocol.js';

/** Host odpovie po zápise celého súboru; po tomto čase viewer vzdá čakanie. */
export const IMPORT_TIMEOUT_MS = 120_000;

export type BcfImportOutcome =
  | { kind: 'done'; summary: BcfImportSummary }
  | { kind: 'rejected'; error: string }
  | { kind: 'invalid'; reason: 'extension' | 'empty' | 'tooLarge' | 'notConnected' | 'busy' | 'timeout' };

let waiting: { id: string; resolve: (o: BcfImportOutcome) => void; timer: ReturnType<typeof setTimeout> } | null = null;

/** Pošle súbor hostu (`dry_run`: len súhrn bez zápisu) a počká na `BCF_IMPORTED`. */
export async function sendBcfImport(
  file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
  dryRun: boolean,
): Promise<BcfImportOutcome> {
  const post = idsHostPost();
  if (!post) return { kind: 'invalid', reason: 'notConnected' };
  if (waiting) return { kind: 'invalid', reason: 'busy' };
  const bad = checkImportFile(file.name, file.size);
  if (bad) return { kind: 'invalid', reason: bad };
  const bytes = await file.arrayBuffer();
  if (waiting) return { kind: 'invalid', reason: 'busy' };
  const id = `bcf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const outcome = new Promise<BcfImportOutcome>((resolve) => {
    const timer = setTimeout(() => { waiting = null; resolve({ kind: 'invalid', reason: 'timeout' }); }, IMPORT_TIMEOUT_MS);
    waiting = { id, resolve, timer };
  });
  const msg: BcfImportMessage = { source: SOURCE, type: 'BCF_IMPORT', id, name: file.name, bytes, dry_run: dryRun };
  post(msg as unknown as Record<string, unknown>);
  return outcome;
}

/** Odpoveď hosta z mosta (`BCF_IMPORTED`); overí sa tu, mimo vstupného balíka. */
export function handleBcfImported(raw: unknown): void {
  const msg: BcfImportedMessage | null = parseBcfImported(raw);
  if (!msg || !waiting || waiting.id !== msg.id) return;
  const { resolve, timer } = waiting;
  clearTimeout(timer);
  waiting = null;
  resolve(msg.ok ? { kind: 'done', summary: msg.summary } : { kind: 'rejected', error: msg.error });
}
