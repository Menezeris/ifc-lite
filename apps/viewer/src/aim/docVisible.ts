/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Viditeľný rozsah karty dokumentu (AIM D-127, #166): čo z aktívnej strany je
 * naozaj v ploche karty a či je výrez z chatu celý v zábere. Čisté výpočty;
 * `docRegion.ts` ich volá po výreze a pri posune a výsledok ide do `view_state`.
 */

import type { DocRegion } from './docRegion.js';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Viditeľná časť strany v zlomkoch (0-1): `page` a `viewport` sú obdĺžniky v
 * súradniciach okna (getBoundingClientRect). null = strana nie je v zábere.
 */
export function visiblePart(
  page: { left: number; top: number; width: number; height: number },
  viewport: { left: number; top: number; width: number; height: number },
): DocRegion | null {
  if (page.width <= 0 || page.height <= 0) return null;
  const x0 = clamp((viewport.left - page.left) / page.width, 0, 1);
  const y0 = clamp((viewport.top - page.top) / page.height, 0, 1);
  const x1 = clamp((viewport.left + viewport.width - page.left) / page.width, 0, 1);
  const y1 = clamp((viewport.top + viewport.height - page.top) / page.height, 0, 1);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Je výrez celý vnútri viditeľnej časti (tolerancia 0,5 % strany na zaokrúhlenie)? */
export function regionInside(region: DocRegion, visible: DocRegion | null): boolean {
  if (!visible) return false;
  const eps = 0.005;
  return region.x >= visible.x - eps && region.y >= visible.y - eps
    && region.x + region.w <= visible.x + visible.w + eps && region.y + region.h <= visible.y + visible.h + eps;
}

/** Zlomky -> percentá strany (ako `region` v open_drawing), na dve desatinné miesta. */
const toPct = (r: DocRegion) => ({ x: +(r.x * 100).toFixed(2), y: +(r.y * 100).toFixed(2), width: +(r.w * 100).toFixed(2), height: +(r.h * 100).toFixed(2) });

/** Stav karty pre `view_state` (AIM D-127): čo z aktívnej strany je naozaj vidno. */
export interface DocVisibleState {
  document_id: string;
  page: number;
  zoom_percent: number;
  /** Plocha karty v px. */
  card: { width: number; height: number };
  /** Viditeľná časť strany v % strany; null = strana mimo záberu. */
  visible: { x: number; y: number; width: number; height: number } | null;
  region?: { x: number; y: number; width: number; height: number };
  region_fully_visible?: boolean;
}

type Rect = { left: number; top: number; width: number; height: number };

/** Stav karty z obdĺžnikov strany a plochy (súradnice okna) pre `view_state`. */
export function describeVisible(docId: string, page: number, zoom: number, pageRect: Rect, viewport: Rect, region: DocRegion | undefined): DocVisibleState {
  const part = visiblePart(pageRect, viewport);
  return {
    document_id: docId,
    page,
    zoom_percent: Math.round(zoom * 100),
    card: { width: Math.round(viewport.width), height: Math.round(viewport.height) },
    visible: part && toPct(part),
    ...(region ? { region: toPct(region), region_fully_visible: regionInside(region, part) } : {}),
  };
}
