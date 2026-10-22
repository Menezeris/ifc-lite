/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pôdorys v záložke (AIM #211): po zmene veľkosti plochy sa znova vyplní. Zamknutý
 * kolmý pohľad zhora (`enterDrawingView`) si po zmene veľkosti canvasu držal staré
 * mierky a posun, takže pri zúžení alebo rozšírení stĺpca vlastností ostal pôdorys ako
 * malý blok pri okraji a vedľa neho prázdna plocha. Ťahanie úchytky stĺpca vyvolá
 * desiatky zmien veľkosti, preto sa kamera prispôsobí až po ustálení (debounce) a len
 * keď sa veľkosť naozaj zmenila. Čistý modul bez store a DOM (test), napojenie je v
 * `useAimPlanRefit.ts`.
 */

export interface Size { width: number; height: number }

/** Čo o scéne treba vedieť pri rozhodovaní; číta sa až po ustálení, nie pri každej zmene. */
export interface RefitContext {
  /** Aktívna 3D strana je pôdorys podlažia (nie 3D, uložený pohľad ani dokument). */
  planInCanvas: boolean;
  /** Kamera je zamknutá kolmo zhora (pôdorys, nie voľná 3D). */
  lockedTopDown: boolean;
}

/** Zmeny menšie ako toto (px) sú šum rozloženia, pôdorys sa nehýbe. */
export const REFIT_MIN_DELTA_PX = 4;
/** Plocha menšia ako toto (px) je zbalený panel, nie pohľad na vyplnenie. */
export const REFIT_MIN_SIZE_PX = 80;
/** Ticho po poslednej zmene veľkosti, kým sa pôdorys prispôsobí (ms). */
export const REFIT_SETTLE_MS = 180;

/** Má sa pôdorys prispôsobiť zmene veľkosti `prev` -> `next`? */
export function shouldRefit(prev: Size | null, next: Size, ctx: RefitContext): boolean {
  if (!ctx.planInCanvas || !ctx.lockedTopDown) return false;
  if (next.width < REFIT_MIN_SIZE_PX || next.height < REFIT_MIN_SIZE_PX) return false;
  if (!prev) return false;
  return Math.abs(next.width - prev.width) >= REFIT_MIN_DELTA_PX || Math.abs(next.height - prev.height) >= REFIT_MIN_DELTA_PX;
}

export interface PlanRefitDeps {
  context: () => RefitContext;
  fit: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/**
 * Regulátor: `resized(size)` sa volá pri každej zmene veľkosti, `fit` prebehne raz po
 * ustálení. Prvá vzorka (rozloženie pri štarte) len zapíše východiskovú veľkosť.
 */
export function createPlanRefit(deps: PlanRefitDeps) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let settled: Size | null = null;
  let latest: Size | null = null;
  let timer: unknown = null;

  const settle = () => {
    timer = null;
    const next = latest;
    if (!next) return;
    const prev = settled;
    settled = next;
    if (shouldRefit(prev, next, deps.context())) deps.fit();
  };

  return {
    resized(size: Size) {
      latest = size;
      if (!settled) settled = size;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(settle, REFIT_SETTLE_MS);
    },
    dispose() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
