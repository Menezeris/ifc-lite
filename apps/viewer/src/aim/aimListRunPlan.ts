/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Spustenie zoznamu z chatu (AIM D-148): čisté rozhodnutie, čo povedať hostu o
 * tabuľke po `OPEN_LIST`. Store sa tu nečíta; lepidlo je v `aimListRun.ts`.
 */

export type ListRunStatus = 'opened' | 'running' | 'done' | 'failed' | 'not_started';

export interface ListRunRequest {
  /** Id návrhu zoznamu (`ListDefinition.id`), podľa neho sa pozná výsledok tohto behu. */
  id: string;
  name: string;
  /** `run` zo správy `OPEN_LIST`. */
  run: boolean;
  /** Hook spustil tabuľku (volal `handleExecuteList`). */
  started: boolean;
}

export interface ListRunSnapshot {
  executing: boolean;
  error: string | null;
  /** Id definície posledného výsledku a jeho počet riadkov; null = žiadny výsledok. */
  result: { id: string | null; totalCount: number } | null;
}

export interface ListRunSummary {
  name: string;
  status: ListRunStatus;
  rows?: number;
  error?: string;
  reason?: string;
}

/**
 * `null` = ešte sa nerozhodlo (čakať); inak súhrn pre `APPLIED`. Po vypršaní
 * čakania (`timedOut`) sa nedokončený beh hlási ako `running`, nespustený ako
 * `not_started` s dôvodom.
 */
export function summarizeListRun(req: ListRunRequest, snap: ListRunSnapshot, timedOut: boolean): ListRunSummary | null {
  const base = { name: req.name };
  if (!req.run) return { ...base, status: 'opened' };
  if (!req.started) {
    return timedOut
      ? { ...base, status: 'not_started', reason: 'nie je načítaný model s dátami alebo sa panel Lists nezobrazil' }
      : null;
  }
  if (snap.error) return { ...base, status: 'failed', error: snap.error };
  if (snap.result && snap.result.id === req.id && !snap.executing) {
    return { ...base, status: 'done', rows: snap.result.totalCount };
  }
  return timedOut ? { ...base, status: 'running' } : null;
}
