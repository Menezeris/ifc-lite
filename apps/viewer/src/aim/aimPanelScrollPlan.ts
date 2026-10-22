/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Posun a zoom panelov z chatu (AIM #183, D-150): čistá matematika bez DOM.
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

/** Pokyn na posun (`SCROLL_PANEL`): smer, položka podľa textu alebo poloha v %; práve jedno z troch. */
export interface PanelScrollRequest {
  direction?: PanelScroll;
  item?: string;
  percent?: number;
  panel?: string;
}

const PANEL_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export const MAX_ITEM_LENGTH = 80;

export function isPanelScrollRequest(m: Record<string, unknown>): boolean {
  if (m.panel !== undefined && !(typeof m.panel === 'string' && PANEL_NAME.test(m.panel))) return false;
  const given = [m.direction, m.item, m.percent].filter((v) => v !== undefined);
  if (given.length !== 1) return false;
  if (m.direction !== undefined) return isPanelScroll(m.direction);
  if (m.item !== undefined) return typeof m.item === 'string' && m.item.trim().length > 0 && m.item.length <= MAX_ITEM_LENGTH;
  return typeof m.percent === 'number' && Number.isFinite(m.percent) && m.percent >= 0 && m.percent <= 100;
}

/** Poloha `scrollTop` pre polohu v % rozsahu posunu (0 = začiatok, 100 = koniec). */
export function percentTarget(percent: number, clientH: number, scrollH: number): number {
  const range = Math.max(0, scrollH - clientH);
  return clamp(range * (Math.max(0, Math.min(100, percent)) / 100), clientH, scrollH);
}

/** Poloha posunu v % rozsahu (0 pri obsahu, ktorý sa zmestí do okna). */
export function scrollPercent(top: number, clientH: number, scrollH: number): number {
  const range = scrollH - clientH;
  return range <= 0 ? 0 : Math.round(Math.max(0, Math.min(1, top / range)) * 100);
}

/** Text bez diakritiky a veľkosti písmen, medzery zlúčené: "Čistý objem " ~ "cisty objem". */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Zoom obsahu panela: `in` / `out` / `reset` alebo násobok v rozsahu. */
export const PANEL_ZOOM_RANGE = { min: 0.5, max: 2.5 } as const;
const ZOOM_STEP = 1.25;
export type PanelZoom = 'in' | 'out' | 'reset' | number;

export function isPanelZoom(v: unknown): v is PanelZoom {
  if (v === 'in' || v === 'out' || v === 'reset') return true;
  return typeof v === 'number' && Number.isFinite(v) && v >= PANEL_ZOOM_RANGE.min && v <= PANEL_ZOOM_RANGE.max;
}

const roundZoom = (z: number) => Math.round(z * 100) / 100;

/** Nový zoom z pokynu; `in` / `out` násobia o krok 1,25 a držia sa v rozsahu. */
export function zoomTarget(zoom: PanelZoom, current: number): number {
  const next = zoom === 'reset' ? 1 : zoom === 'in' ? current * ZOOM_STEP : zoom === 'out' ? current / ZOOM_STEP : zoom;
  return roundZoom(Math.max(PANEL_ZOOM_RANGE.min, Math.min(PANEL_ZOOM_RANGE.max, next)));
}
