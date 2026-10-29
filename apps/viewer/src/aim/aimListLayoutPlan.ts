/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vzhľad tabuľky zo správy `view` (AIM #274, #275): šírky stĺpcov (`fit` podľa obsahu, `auto`,
 * pixely) a zvýraznenie riadkov, stĺpcov, buniek a súčtov. Čisté rozhodnutia nad stĺpcami a riadkami
 * výsledku; store a React sú v `aimListTable.ts`.
 */

import type { CellValue, ColumnDefinition, ListRow } from '@ifc-lite/lists';
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, columnLabel, findColumn, refLabel,
  type AimColumnWidths, type AimListColumnRef, type AimListHighlight } from './aimListViewPlan.js';

const CHAR_PX = 7;
const PADDING_PX = 34;
/** Hlavička nesie navyše šípku zoradenia, ikonu súčtu a ponuku stĺpca. */
const HEADER_EXTRA_PX = 58;
/** Najviac toľko riadkov sa prejde pri `fit` (veľké tabuľky nezdržia vykreslenie). */
const FIT_SCAN_ROWS = 20000;

const text = (v: CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4).replace(/\.?0+$/, '');
  return String(v);
};

/** Šírka stĺpca v px podľa najdlhšieho obsahu a hlavičky (ako `autoColumnWidth`, ale bez stropu 460 a vzorky 200). */
export function fitColumnWidth(label: string, rows: readonly ListRow[], colIdx: number): number {
  let longest = 0;
  for (let i = 0; i < rows.length && i < FIT_SCAN_ROWS; i++) {
    const len = text(rows[i].values[colIdx]).length;
    if (len > longest) longest = len;
  }
  const px = Math.max(longest * CHAR_PX + PADDING_PX, label.length * CHAR_PX + HEADER_EXTRA_PX);
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, px));
}

export interface WidthPlan {
  /** Nové šírky (px) podľa id stĺpca. */
  set: Record<string, number>;
  /** Stĺpce, ktorým sa ručná šírka zruší (späť na predvolenú). */
  reset: string[];
  /** Mená od hosta, ktoré zoznam nemá. */
  missing: string[];
}

export function planColumnWidths(spec: AimColumnWidths, columns: readonly ColumnDefinition[], rows: readonly ListRow[]): WidthPlan {
  const plan: WidthPlan = { set: {}, reset: [], missing: [] };
  const fit = (col: ColumnDefinition) => fitColumnWidth(columnLabel(col), rows, columns.indexOf(col));
  if (spec === 'fit') columns.forEach((c) => { plan.set[c.id] = fit(c); });
  else if (spec === 'auto') plan.reset = columns.map((c) => c.id);
  else {
    for (const { column, width } of spec) {
      const col = findColumn(columns, column);
      if (!col) plan.missing.push(refLabel(column));
      else if (width === 'auto') plan.reset.push(col.id);
      else plan.set[col.id] = width === 'fit' ? fit(col) : width;
    }
  }
  return plan;
}

/** Zvýraznenie preložené na stĺpce a riadky výsledku. */
export interface ResolvedHighlight {
  rowKeys: Set<string>;
  columnIds: Set<string>;
  cellKeys: Set<string>;
  /** Súčty: všetky stĺpce, alebo len vybrané. */
  sumAll: boolean;
  sumIds: Set<string>;
  missing: string[];
}

export const rowKey = (row: Pick<ListRow, 'modelId' | 'entityId'>) => `${row.modelId}:${row.entityId}`;
export const cellKey = (row: Pick<ListRow, 'modelId' | 'entityId'>, columnId: string) => `${rowKey(row)}|${columnId}`;

const fold = (v: string) => v.trim().toLowerCase();
/** Bunka sa rovná hodnote od hosta: číslo číselne (aj číslo v texte), text bez ohľadu na veľkosť písmen. */
export function cellEquals(cell: CellValue, wanted: string | number): boolean {
  if (cell === null || cell === undefined || cell === '') return false;
  if (typeof wanted === 'number') return typeof cell === 'number' ? cell === wanted : Number(cell) === wanted;
  if (typeof cell === 'number') return String(cell) === wanted.trim() || (wanted.trim() !== '' && cell === Number(wanted));
  return fold(String(cell)) === fold(wanted);
}

export function resolveHighlight(h: AimListHighlight, columns: readonly ColumnDefinition[], rows: readonly ListRow[]): ResolvedHighlight {
  const out: ResolvedHighlight = { rowKeys: new Set(), columnIds: new Set(), cellKeys: new Set(), sumAll: h.sum === true, sumIds: new Set(), missing: [] };
  const find = (ref: AimListColumnRef): { col: ColumnDefinition; idx: number } | null => {
    const col = findColumn(columns, ref);
    if (!col) {
      out.missing.push(refLabel(ref));
      return null;
    }
    return { col, idx: columns.indexOf(col) };
  };
  if (h.rows) {
    const c = find(h.rows.column);
    if (c) for (const r of rows) if (h.rows.values.some((w) => cellEquals(r.values[c.idx], w))) out.rowKeys.add(rowKey(r));
  }
  for (const ref of h.columns ?? []) {
    const c = find(ref);
    if (c) out.columnIds.add(c.col.id);
  }
  for (const cell of h.cells ?? []) {
    const target = find(cell.column);
    const by = find(cell.row.column);
    if (!target || !by) continue;
    for (const r of rows) if (cellEquals(r.values[by.idx], cell.row.value)) out.cellKeys.add(cellKey(r, target.col.id));
  }
  if (Array.isArray(h.sum)) {
    for (const ref of h.sum) {
      const c = find(ref);
      if (c) out.sumIds.add(c.col.id);
    }
  }
  return out;
}

export const NO_HIGHLIGHT: ResolvedHighlight = { rowKeys: new Set(), columnIds: new Set(), cellKeys: new Set(), sumAll: false, sumIds: new Set(), missing: [] };

/** Zvýraznený riadok, ktorý sa má zobraziť ako prvý (riadky a riadky zvýraznených buniek). */
export function focusRowKeys(h: ResolvedHighlight): Set<string> {
  const keys = new Set(h.rowKeys);
  for (const k of h.cellKeys) keys.add(k.slice(0, k.lastIndexOf('|')));
  return keys;
}
