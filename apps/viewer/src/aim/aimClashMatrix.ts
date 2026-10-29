/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Matica disciplín kolízií (#302): z výsledkov behu sa spočíta, koľko kolízií je medzi ktorými modelmi federácie
 * (ASR x VZT, VZT x VZT) a v akom stave. Odvodené z existujúcich výsledkov, nič sa nepúšťa znova. Čistá logika bez
 * importov viewera; používa ju panel (lišta) aj `view_state.clash_local.matrix`.
 */

import { cellOf, type MatrixCell } from './clashCellFilter.js';
import { pairKey, type ClashRich } from './aimClashPlan.js';
import type { ClashReviewState } from './clash-protocol.js';

export interface MatrixRow extends MatrixCell {
  total: number;
  by_status: { hard: number; clearance: number };
  by_review: { open: number; resolved: number; accepted: number };
}

export interface ClashMatrix {
  /** Štítky modelov, ktoré sa v behu vyskytli, zoradené. */
  models: string[];
  /** Len neprázdne bunky, každá raz (a <= b), zoradené podľa štítkov. */
  cells: MatrixRow[];
}

/** Matica jedného pravidla; dotyk sa nepočíta (ako v `countRun`), stav kontroly je `open`, kým ho niekto nezmení. */
export function buildMatrix(
  rule: string,
  clashes: readonly ClashRich[],
  labelOf: (modelId: string) => string,
  review: (key: string) => ClashReviewState | undefined,
): ClashMatrix {
  const cells = new Map<string, MatrixRow>();
  const models = new Set<string>();
  for (const c of clashes) {
    if (c.rule !== rule || c.status === 'touch') continue;
    const la = labelOf(c.a.model);
    const lb = labelOf(c.b.model);
    models.add(la);
    models.add(lb);
    const cell = cellOf(la, lb);
    const id = `${cell.a}\u0000${cell.b}`;
    let row = cells.get(id);
    if (!row) {
      row = { ...cell, total: 0, by_status: { hard: 0, clearance: 0 }, by_review: { open: 0, resolved: 0, accepted: 0 } };
      cells.set(id, row);
    }
    row.total += 1;
    row.by_status[c.status] += 1;
    row.by_review[review(pairKey(rule, c.a.key, c.b.key)) ?? 'open'] += 1;
  }
  return {
    models: [...models].sort(),
    cells: [...cells.values()].sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0)),
  };
}
