/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Posun panela vlastností z chatu (AIM #183): čistá matematika bez DOM.
 * Vykonanie a sledovanie zvýrazneného riadka je v `aimPanelScroll.ts`.
 */

export const PANEL_SCROLLS = ['up', 'down', 'top', 'bottom'] as const;
export type PanelScroll = (typeof PANEL_SCROLLS)[number];

export const isPanelScroll = (v: unknown): v is PanelScroll => (PANEL_SCROLLS as readonly unknown[]).includes(v);

/** Krok `up` / `down`: časť viditeľnej výšky, aby ostal kontext z predošlého zobrazenia. */
export const PAGE_FRACTION = 0.8;

const clamp = (top: number, clientH: number, scrollH: number) => Math.max(0, Math.min(top, Math.max(0, scrollH - clientH)));

/** Nová poloha `scrollTop` pre pokyn (vždy v rozsahu 0 .. scrollH - clientH). */
export function scrollTarget(dir: PanelScroll, top: number, clientH: number, scrollH: number): number {
  switch (dir) {
    case 'top':
      return 0;
    case 'bottom':
      return clamp(scrollH, clientH, scrollH);
    case 'up':
      return clamp(top - clientH * PAGE_FRACTION, clientH, scrollH);
    case 'down':
      return clamp(top + clientH * PAGE_FRACTION, clientH, scrollH);
  }
}

export interface Box {
  top: number;
  height: number;
}

/** Poloha `scrollTop`, pri ktorej je riadok `row` v strede okna `view` (obe v súradniciach obrazovky). */
export function centeredTop(row: Box, view: Box, top: number, scrollH: number): number {
  return clamp(top + (row.top - view.top) - (view.height - row.height) / 2, view.height, scrollH);
}

/** Riadok je celý v okne s okrajom (zlomok výšky okna) hore aj dole. */
export function rowVisible(row: Box, view: Box, margin = 0.1): boolean {
  const pad = view.height * margin;
  return row.top >= view.top + pad && row.top + row.height <= view.top + view.height - pad;
}
