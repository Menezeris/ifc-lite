/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lišta záložiek (AIM D-132, #240): ktoré záložky sa zmestia a ktoré idú do
 * rozbaľovacieho zoznamu na konci lišty (ako v prehliadači alebo Revite).
 * Čistá funkcia bez DOM; šírky dodá lišta z `ResizeObserver`.
 *
 * Pravidlá: keď sa zmestia všetky, zoznam sa nekreslí. Inak sa viditeľné miesta
 * (po odpočítaní tlačidla zoznamu) plnia v poradí: 3D (vždy pripnutá prvá),
 * aktívna, záložka vedľa, potom ostatné podľa poradia na lište. Viditeľné
 * záložky ostávajú v pôvodnom poradí; aktívna sa teda do viditeľnej časti
 * dostane sama, bez zmeny poradia v `view_state.tabs`.
 */

export interface FitInput {
  /** Id záložiek v poradí na lište (prvá je 3D). */
  ids: readonly string[];
  activeId: string;
  besideId: string | null;
  /** Šírka jedného miesta záložky v px (menovka je orezaná na túto šírku). */
  slotWidth: number;
  /** Šírka tlačidla zoznamu v px. */
  moreWidth: number;
  /** Šírka lišty určená na záložky v px. */
  available: number;
}

export interface FitResult {
  visible: string[];
  hidden: string[];
}

export function fitTabs({ ids, activeId, besideId, slotWidth, moreWidth, available }: FitInput): FitResult {
  const slot = Math.max(1, slotWidth);
  if (ids.length * slot <= available) return { visible: [...ids], hidden: [] };

  // Aspoň jedno miesto (3D), aj keď je lišta užšia než tlačidlo.
  const capacity = Math.max(1, Math.floor((available - moreWidth) / slot));
  const priority = [ids[0], activeId, besideId, ...ids].filter((id): id is string => id !== null && ids.includes(id));
  const keep = new Set<string>();
  for (const id of priority) {
    if (keep.size >= capacity) break;
    keep.add(id);
  }
  return { visible: ids.filter((id) => keep.has(id)), hidden: ids.filter((id) => !keep.has(id)) };
}
