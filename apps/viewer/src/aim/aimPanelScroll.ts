/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Posun panela vlastností (AIM #183): `SCROLL_PANEL` z chatu ("posuň dole", "hore",
 * "na začiatok") a udržanie zvýrazneného riadka vo výreze po `SELECT` s `highlight`.
 *
 * Jednorazové `scrollIntoView` riadok minulo: panel po výbere dokresľuje obsah nad ním
 * (atribúty, sady z typu, rozbalenie sady) a riadok sa posunul pod viditeľnú časť.
 * `revealRow` preto po prvom posune sleduje polohu riadka, kým sa panel ustáli,
 * a keď riadok vypadne z výrezu, vycentruje ho znova. Posúva len skrolovací kontajner
 * panela (nie okolité stránky) a skončí pri prvom zásahu používateľa.
 */

import { centeredTop, rowVisible, scrollTarget, type PanelScroll } from './aimPanelScrollPlan.js';

/** Ako dlho po prvom posune sa riadok sleduje (panel sa dokresľuje najviac pár stoviek ms). */
const FOLLOW_MS = 3000;
/** Snímky bez pohybu skrolovania, kým sa riadok opravuje (nebojuje s plynulým posunom). */
const IDLE_FRAMES = 2;
const USER_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

let stopReveal: (() => void) | null = null;

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Najbližší skrolovací predok (Radix ScrollArea viewport, na mobile kontajner spodného panela). */
export function scrollerOf(el: Element | null): HTMLElement | null {
  for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return p;
  }
  return null;
}

/** Skrolovací kontajner panela vlastností (z AIM bloku, inak z prvého riadka vlastností). */
export function panelScroller(): HTMLElement | null {
  const anchor = document.querySelector('[data-aim-inspector]') ?? document.querySelector('[data-prop-key]');
  return scrollerOf(anchor);
}

/** Zruší sledovanie riadka (nový výber, ručný pokyn na posun, zásah používateľa). */
export function cancelReveal(): void {
  const stop = stopReveal;
  stopReveal = null;
  stop?.();
}

/**
 * Vycentruje riadok v skrolovacom kontajneri a drží ho vo výreze, kým sa panel ustáli.
 * `getRow` vracia aktuálny prvok (React ho môže prekresliť inou inštanciou).
 */
export function revealRow(getRow: () => Element | null): void {
  cancelReveal();
  const startedAt = Date.now();
  let raf = 0;
  let lastTop = -1;
  let idle = 0;
  let first = true;
  const stop = () => {
    cancelAnimationFrame(raf);
    for (const e of USER_EVENTS) document.removeEventListener(e, stop, true);
    if (stopReveal === stop) stopReveal = null;
  };
  const step = () => {
    raf = requestAnimationFrame(step);
    if (Date.now() - startedAt > FOLLOW_MS) return stop();
    const row = getRow();
    const sc = row?.isConnected ? scrollerOf(row) : null;
    if (!row || !sc) return;
    idle = sc.scrollTop === lastTop ? idle + 1 : 0;
    lastTop = sc.scrollTop;
    if (!first && idle < IDLE_FRAMES) return;
    const r = row.getBoundingClientRect();
    const v = sc.getBoundingClientRect();
    if (v.height === 0 || (!first && rowVisible({ top: r.top, height: r.height }, { top: v.top, height: v.height }))) return;
    const top = centeredTop({ top: r.top, height: r.height }, { top: v.top, height: v.height }, sc.scrollTop, sc.scrollHeight);
    sc.scrollTo({ top, behavior: first && !reduceMotion() ? 'smooth' : 'auto' });
    first = false;
  };
  stopReveal = stop;
  // Vlastné zásahy (koliesko, dotyk, kláves, klik) ruší sledovanie; programové kliky na sady nie.
  for (const e of USER_EVENTS) document.addEventListener(e, stop, { capture: true, passive: true });
  raf = requestAnimationFrame(step);
}

/** Pokyn z chatu: posun panela vlastností. Čo sa nepodarilo, zapíše ako problém pre `APPLIED`. */
export function scrollPanel(dir: PanelScroll, noteIssue: (text: string) => void): void {
  cancelReveal();
  const sc = panelScroller();
  if (!sc) return noteIssue('SCROLL_PANEL: panel vlastností nie je otvorený');
  if (sc.scrollHeight <= sc.clientHeight) return; // celý obsah je vidieť, nie je čo posúvať
  sc.scrollTo({ top: scrollTarget(dir, sc.scrollTop, sc.clientHeight, sc.scrollHeight), behavior: reduceMotion() ? 'auto' : 'smooth' });
}
