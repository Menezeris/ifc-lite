/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čistá logika ICDD (D-181): stav posledného behu, prechody podľa `ICDD_STATUS`, text výsledku
 * a limit 5 s pre staršieho hosta. Bez Reactu a bez storu, aby sa dala testovať samostatne.
 */

import type { IcddCheckResult, IcddExportResult, IcddOp, IcddStatusMessage } from './icdd-protocol.js';

/** Starší host `ICDD_*` nepozná: bez prvého `ICDD_STATUS` do tohto limitu ho viewer vyhlási za nepodporujúceho. */
export const ICDD_HOST_TIMEOUT_MS = 5000;
export const ICDD_NO_HOST = 'host nepodporuje ICDD';
/** Koľko prvých chýb dialóg ukáže. */
export const ICDD_MAX_SHOWN = 5;

export interface IcddRun {
  id: string;
  op: IcddOp;
  phase: 'waiting' | 'running' | 'done' | 'error';
  message: string;
  result?: IcddExportResult | IcddCheckResult;
}

/** Nový beh po odoslaní žiadosti: čaká na prvý stav hosta. */
export const startRun = (id: string, op: IcddOp): IcddRun => ({ id, op, phase: 'waiting', message: 'Čakám na hosta...' });

/** Stav hosta pre iný beh ako aktuálny (oneskorená odpoveď staršieho behu) sa ignoruje. */
export function applyStatus(run: IcddRun | null, msg: IcddStatusMessage): IcddRun | null {
  if (!run || run.id !== msg.id || run.op !== msg.op) return run;
  if (run.phase === 'done' || run.phase === 'error') return run; // koncový stav sa nemení
  return { id: run.id, op: run.op, phase: msg.phase, message: msg.message, ...(msg.result ? { result: msg.result } : {}) };
}

/** Uplynul limit bez stavu hosta: len ak beh stále čaká. */
export function applyTimeout(run: IcddRun | null, id: string): IcddRun | null {
  if (!run || run.id !== id || run.phase !== 'waiting') return run;
  return { ...run, phase: 'error', message: ICDD_NO_HOST };
}

export const isBusy = (run: IcddRun | null): boolean => !!run && (run.phase === 'waiting' || run.phase === 'running');

const kb = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

/** Prvých `limit` riadkov s dopočtom zvyšku ("... a ďalších 3"). */
export function firstLines(items: readonly string[], limit = ICDD_MAX_SHOWN): string[] {
  if (items.length <= limit) return [...items];
  return [...items.slice(0, limit), `... a ďalších ${items.length - limit}`];
}

export interface IcddSummary {
  title: string;
  lines: string[];
  /** Prvé chyby (export: chyby validácie; kontrola: chyby kontajnera). */
  errors: string[];
  ok: boolean;
}

export function summarize(run: IcddRun): IcddSummary {
  if (run.phase === 'error') return { title: run.op === 'export' ? 'Export ICDD zlyhal' : 'Kontrola ICDD zlyhala', lines: [run.message], errors: [], ok: false };
  if (run.op === 'export') {
    const r = run.result as IcddExportResult | undefined;
    // `done` bez výsledku je porušenie protokolu hosta, nie úspech: dialóg nesmie ukázať zelený export bez dát.
    if (!r) return { title: run.phase === 'done' ? 'Export ICDD bez výsledku' : 'Export ICDD', lines: [run.message], errors: [], ok: false };
    const lines = [`${r.filename} (${kb(r.size_bytes)})`, `Obsah: ${r.payloads}, prepojenia: ${r.links}`];
    if (r.warnings.length) lines.push(`Upozornení: ${r.warnings.length}`);
    if (r.skipped.length) lines.push(`Vynechané: ${r.skipped.length}`);
    return { title: r.ok ? 'ICDD exportované' : 'ICDD exportované s chybami', lines, errors: firstLines(r.errors), ok: r.ok };
  }
  const r = run.result as IcddCheckResult | undefined;
  if (!r) return { title: run.phase === 'done' ? 'Kontrola ICDD bez výsledku' : 'Kontrola ICDD', lines: [run.message], errors: [], ok: false };
  const lines = [r.same ? 'Kontajner sa zhoduje s AIM' : 'Kontajner sa líši od AIM'];
  if (!r.same) {
    lines.push(`Prepojenia len v kontajneri: ${r.links_only_in_container}`, `Prepojenia len v AIM: ${r.links_only_in_aim}`, `Zmenený obsah: ${r.payloads_changed}`);
  }
  // Prázdny reťazec je platná (hoci divná) verzia od hosta: ukáže sa, nie je to "bez verzie" (null / chýba).
  if (r.version_id !== undefined && r.version_id !== null) lines.push(`Verzia: ${r.version_id === '' ? '(prázdna)' : r.version_id}`);
  return { title: r.ok ? 'ICDD je v poriadku' : 'ICDD má chyby', lines, errors: firstLines(r.errors), ok: r.ok && r.same };
}
