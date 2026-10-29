/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Košík pre `VIEW_CAPTURE` (AIM #315). Tlačidlo Uložiť v paneli ukladá košík, ktorý používateľ
 * postavil; chat ukladá to, čo je vidieť. Predtým `capture` vzal neprázdny košík (aj starý z
 * minulého uloženia) alebo výber, a pri izolácii cez Lens uložil jediný vybraný prvok, hoci
 * viditeľných bolo sto. Teraz: kým je v platnosti akákoľvek izolácia alebo skrytie (Lens, trieda,
 * podlažie, ručná izolácia, skryté prvky), košík = viditeľné prvky. Bez izolácie platí pôvodné
 * poradie (košík, výber, hierarchia, viditeľné).
 */

import { useViewerStore } from '@/store';
import { computeIsolationFilterSet, getSmartBasketInputFromStore, getVisibleBasketEntityRefsFromStore, type BasketInputSource } from '@/store/basketVisibleSet';

type Snapshot = ReturnType<typeof useViewerStore.getState>;

/** Je v platnosti izolácia alebo skrytie, ktoré zužuje to, čo je vidieť (Lens skrýva cez `hiddenEntities` aj `lensHiddenIds`). */
export function isViewReduced(s: Snapshot): boolean {
  return computeIsolationFilterSet(s) !== null || s.hiddenEntities.size > 0 || s.lensHiddenIds.size > 0;
}

/**
 * Nastaví košík pre uloženie pohľadu a vráti zdroj pre `BasketView.source`;
 * `null`, keď nie je čo uložiť.
 */
export function prepareCaptureBasket(): BasketInputSource | null {
  const s = useViewerStore.getState();
  if (isViewReduced(s)) {
    const refs = getVisibleBasketEntityRefsFromStore();
    if (refs.length === 0) return null;
    s.setBasket(refs);
    return 'visible';
  }
  if (s.pinboardEntities.size > 0) return getSmartBasketInputFromStore().source;
  const { refs, source } = getSmartBasketInputFromStore();
  if (refs.length === 0) return null;
  s.setBasket(refs);
  return source;
}
