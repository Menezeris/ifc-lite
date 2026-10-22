/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Spojka medzi chatom a lokálnym stavom upstream komponentov zoznamu (AIM D-149):
 * zoradenie a hľadanie žijú v `ListResultsTable`, maximalizácia v `BottomStrip`
 * (`useState`, store ich nevidí). Chat sem zapíše požiadavku, hák v komponente ju
 * vykoná a späť zapíše, čo tabuľka a pruh práve ukazujú. Bez závislostí, lebo
 * `BottomStrip` je vo vstupnom balíku.
 */

export interface ListTableRequest {
  /** Id definície zoznamu, na ktorú sa požiadavka vzťahuje; null = na ten, ktorý je zobrazený. */
  target: string | null;
  /** Id stĺpca a smer; null = zrušiť zoradenie. */
  sort?: { columnId: string; dir: 'asc' | 'desc' } | null;
  search?: string;
  /** Id stĺpca na farby prvkov v 3D; null = zrušiť (krok 2). */
  colorBy?: string | null;
  /** Formát, ktorý tabuľka ponúkne zvýrazneným tlačidlom na stiahnutie. */
  export?: 'csv' | 'xlsx' | 'pdf';
}

/** Čo tabuľka výsledkov práve ukazuje (zapisuje hák v `ListResultsTable`). */
export interface ListTableReport {
  listId: string | null;
  sort: { columnId: string; dir: 'asc' | 'desc' } | null;
  search: string;
  /** Riadky po hľadaní a filtri "len viditeľné". */
  visibleRows: number;
  /** Súčty viditeľných riadkov v jednotke tabuľky. */
  sums: { columnId: string; value: number; unit?: string }[];
  /** Stĺpec s farbami prvkov v 3D (id), ak je "Color by" z tabuľky aktívne. */
  colorBy: string | null;
  /** Formát ponúknutý na stiahnutie (čaká na klik používateľa). */
  exportReady: 'csv' | 'xlsx' | 'pdf' | null;
}

export interface StripReport {
  /** Panel aktívny v spodnom pruhu (null = pruh nie je). */
  active: string | null;
  maximized: boolean;
}

let tableRequest: ListTableRequest | null = null;
let maximizeRequest: boolean | null = null;
let tableReport: ListTableReport | null = null;
let stripReport: StripReport | null = null;
/** Od posledného `APPLIED` prišla požiadavka hákom (čaká sa na ich hlásenie). */
let viewRequested = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const subscribeListView = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function requestListTable(req: ListTableRequest): void {
  tableRequest = req;
  viewRequested = true;
  emit();
}
export function requestStripMaximize(on: boolean): void {
  maximizeRequest = on;
  viewRequested = true;
  emit();
}
export function takeViewRequested(): boolean {
  const r = viewRequested;
  viewRequested = false;
  return r;
}
export const pendingTableRequest = () => tableRequest;
export const pendingMaximize = () => maximizeRequest;
export function takeTableRequest(): ListTableRequest | null {
  const r = tableRequest;
  tableRequest = null;
  return r;
}
export function takeMaximize(): boolean | null {
  const r = maximizeRequest;
  maximizeRequest = null;
  return r;
}
export const reportTable = (r: ListTableReport | null) => { tableReport = r; };
export const reportStrip = (r: StripReport | null) => { stripReport = r; };
export const tableState = () => tableReport;
export const stripState = () => stripReport;

/** Odpojenie mostu: zahodiť nevykonané požiadavky. */
export function resetListView(): void {
  tableRequest = null;
  maximizeRequest = null;
}
