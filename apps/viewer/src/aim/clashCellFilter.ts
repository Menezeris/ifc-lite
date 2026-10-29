/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Filter zoznamu kolízií podľa bunky matice disciplín (#302): jediná časť matice, ktorú potrebuje upstream panel
 * clash. Malý a bez importov viewera; matica samotná (`aimClashMatrix.ts`) je lenivá. Bunka je dvojica štítkov
 * modelov bez ohľadu na poradie (ASR x VZT je to isté ako VZT x ASR).
 */

import { create } from 'zustand';

export interface MatrixCell { a: string; b: string }

/** Dvojica štítkov v stálom poradí, aby ASR x VZT a VZT x ASR boli jedna bunka. */
export const cellOf = (x: string, y: string): MatrixCell => (x <= y ? { a: x, b: y } : { a: y, b: x });

export const sameCell = (x: MatrixCell | null, y: MatrixCell | null): boolean => (x == null || y == null ? x === y : x.a === y.a && x.b === y.b);

/** Patrí kolízia (modely jej prvkov A a B, už ako štítky) do bunky? Bez bunky patrí každá. */
export function inCell(cell: MatrixCell | null, labelA: string, labelB: string): boolean {
  if (!cell) return true;
  return sameCell(cellOf(labelA, labelB), cell);
}

export const useClashCell = create<{ cell: MatrixCell | null }>()(() => ({ cell: null }));

/** Klik na bunku ju zapne, ďalší klik na tú istú vypne. */
export const toggleClashCell = (next: MatrixCell): void =>
  useClashCell.setState((s) => ({ cell: sameCell(s.cell, next) ? null : { a: next.a, b: next.b } }));

export const clearClashCell = (): void => useClashCell.setState({ cell: null });
