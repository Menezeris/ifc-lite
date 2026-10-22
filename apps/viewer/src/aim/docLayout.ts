/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ustálenie šírky plochy PDF karty (AIM #239). Šírka strany sa odvodzuje od
 * šírky posúvanej plochy; posuvník ju zmenšuje o ~15 px. Keď je strana pri
 * zoome 100 % o pár pixelov vyššia než plocha, objaví sa zvislý posuvník,
 * plocha sa zúži, strana (pomer strán) zníži, posuvník zmizne, plocha sa
 * rozšíri... a tak dookola, vidno to ako chvenie. Dve poistky: `scrollbar-gutter:
 * stable` na ploche (posuvník šírku vôbec nemení) a tento filter, ktorý
 * zahodí zlomky pixela a zastaví kmitanie A-B-A tam, kde gutter nie je podporený.
 */

/** Zlomky pixela v šírke nie sú zmena rozloženia, len zaokrúhľovanie. */
const roundDown = (w: number) => Math.floor(w + 1e-6);

export interface BodyWidthSettler {
  /** Šírka, ktorú má rozloženie použiť pre novo nameranú šírku plochy. */
  next(measured: number): number;
}

export function createBodyWidthSettler(): BodyWidthSettler {
  let current = 0;
  let before = 0; // šírka pred `current`, na rozpoznanie kmitania A-B-A
  let frozen = false;
  return {
    next(measured) {
      const w = roundDown(measured);
      if (w === current) return current;
      // Zmrazené platí len pre dve kmitajúce šírky; iná šírka je skutočná zmena
      // veľkosti panela (ťahanie deliča) a rozloženie ju znova sleduje.
      if (frozen) {
        if (w === before) return current;
        frozen = false;
      }
      if (w === before && current > 0) {
        // A -> B -> A: posuvník prepína šírku. Ostať pri užšej (bez posuvníka je
        // strana len o pár pixelov užšia než plocha, vizuálne bez rozdielu).
        frozen = true;
        current = Math.min(current, w);
        return current;
      }
      before = current;
      current = w;
      return current;
    },
  };
}
