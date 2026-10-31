/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stĺpce zoznamu s hodnotami od hosta (AIM D-174, #277): `source: "host"`, hodnoty
 * `{ GlobalId: text }` pošle host v správe `OPEN_LIST` / `LIST_UPDATE`. Malý store bez
 * závislostí: provider zoznamu (`lib/lists/adapter.ts`) z neho číta pri behu, validácia
 * a zápis idú z lenivého `aimList.js`.
 */

/** Najviac kľúčov (GlobalId) v jednom stĺpci a znakov v hodnote; viac = neplatná správa. */
export const MAX_HOST_VALUES = 20_000;
export const MAX_HOST_VALUE_CHARS = 200;

import type { ListResult } from '@ifc-lite/lists';

const columns = new Map<string, ReadonlyMap<string, string>>();

/** Je `v` mapa GlobalId -> text v limitoch? (prázdna je platná: host nemá čo poslať). */
export function isHostValues(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  let n = 0;
  for (const key in v as Record<string, unknown>) {
    if (++n > MAX_HOST_VALUES || !key) return false;
    const val = (v as Record<string, unknown>)[key];
    if (typeof val !== 'string' || val.length > MAX_HOST_VALUE_CHARS) return false;
  }
  return true;
}

/** Hodnoty stĺpca `key`; nové prepíšu staré (znovu pridaný stĺpec). */
export function setHostColumn(key: string, values: Record<string, string>): void {
  columns.set(key, new Map(Object.entries(values)));
}

export function clearHostColumns(): void {
  columns.clear();
}

/** Text bunky pre GlobalId prvku alebo `undefined` (prázdna bunka). */
export function hostColumnValue(key: string, globalId: string | undefined): string | undefined {
  return globalId ? columns.get(key)?.get(globalId) : undefined;
}

/** Počet hodnôt, ktoré host stĺpcu poslal (0 = stĺpec je prázdny alebo neznámy). */
export function hostColumnSize(key: string): number {
  return columns.get(key)?.size ?? 0;
}

/** Id stĺpca od hosta -> počet riadkov výsledku, ktorým sa našla hodnota (`matched`, D-174). */
export function hostMatched(result: Pick<ListResult, 'columns' | 'rows'>): Map<string, number> {
  const out = new Map<string, number>();
  result.columns.forEach((col, i) => {
    if (col.source === 'host') out.set(col.id, result.rows.reduce((n, row) => n + (row.values[i] != null ? 1 : 0), 0));
  });
  return out;
}
