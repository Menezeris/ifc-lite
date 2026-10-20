/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výrez strany PDF karty z chatu (AIM D-117): host pošle DOCUMENT_OPEN s
 * `region` (zlomky strany 0-1, počiatok vľavo hore) a karta sa priblíži tak,
 * aby výrez vyplnil plochu, a vycentruje ho. Upstream `docJump` nesie len
 * stranu, preto má výrez vlastný store; PdfDocumentView volá len
 * `useAimDocRegion` (jeden riadok v bloku AIM-FORK, súbor je na limite veľkosti).
 */

import { useEffect, useRef, type RefObject } from 'react';
import { create } from 'zustand';

/** Výrez strany v zlomkoch (0-1), počiatok vľavo hore. */
export interface DocRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rovnaké hranice ako zoom karty (PdfDocumentView ZOOM_MIN / ZOOM_MAX). */
export const REGION_ZOOM_MIN = 0.5;
export const REGION_ZOOM_MAX = 16;
/** Najmenší výrez (1 % strany) - menší by narazil na strop zoomu. */
const MIN_SIZE = 0.01;
/** Okraj okolo výrezu v px, aby nebol nalepený na hranu plochy. */
const MARGIN_PX = 24;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Výrez z drôtu (nedôveryhodný postMessage): null, ak nie je použiteľný. */
export function normalizeDocRegion(raw: unknown): DocRegion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const nums = [r.x, r.y, r.w, r.h];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [x0, y0, w0, h0] = nums as number[];
  if (w0 <= 0 || h0 <= 0) return null;
  const x = clamp(x0, 0, 1 - MIN_SIZE);
  const y = clamp(y0, 0, 1 - MIN_SIZE);
  return { x, y, w: clamp(w0, MIN_SIZE, 1 - x), h: clamp(h0, MIN_SIZE, 1 - y) };
}

/**
 * Zoom karty, pri ktorom výrez vyplní plochu. `baseWidth` = šírka strany pri
 * zoome 1 (px), `aspect` = šírka / výška strany.
 */
export function regionZoom(
  region: DocRegion,
  baseWidth: number,
  viewport: { width: number; height: number },
  aspect: number,
): number {
  if (baseWidth <= 0 || aspect <= 0) return 1;
  const w = Math.max(1, viewport.width - MARGIN_PX);
  const h = Math.max(1, viewport.height - MARGIN_PX);
  const byWidth = w / (region.w * baseWidth);
  const byHeight = (h * aspect) / (region.h * baseWidth);
  return clamp(Math.min(byWidth, byHeight), REGION_ZOOM_MIN, REGION_ZOOM_MAX);
}

/**
 * Posun plochy, ktorý dá stred výrezu do stredu plochy. `page` = obdĺžnik strany
 * v súradniciach obsahu plochy (px, už pri cieľovom zoome).
 */
export function regionScroll(
  region: DocRegion,
  page: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const cx = page.left + (region.x + region.w / 2) * page.width;
  const cy = page.top + (region.y + region.h / 2) * page.height;
  return { left: Math.max(0, cx - viewport.width / 2), top: Math.max(0, cy - viewport.height / 2) };
}

export interface DocRegionRequest {
  docId: string;
  /** Strana výrezu; bez nej strana, na ktorej karta práve je. */
  page?: number;
  region: DocRegion;
  /** Opakovaný rovnaký výrez sa vykoná znova. */
  nonce: number;
}

interface DocRegionState {
  request: DocRegionRequest | null;
  requestRegion: (docId: string, region: DocRegion, page?: number) => void;
  clear: (nonce: number) => void;
}

export const useAimDocRegionStore = create<DocRegionState>((set, get) => ({
  request: null,
  requestRegion: (docId, region, page) =>
    set({
      request: {
        docId,
        region,
        ...(page !== undefined ? { page } : {}),
        nonce: (get().request?.nonce ?? 0) + 1,
      },
    }),
  clear: (nonce) => {
    if (get().request?.nonce === nonce) set({ request: null });
  },
}));

export interface DocRegionViewInputs {
  docId: string;
  /** Otvorené PDF; kým je null, výrez čaká. */
  pdf: unknown;
  /** Šírka plochy karty (px, ResizeObserver). */
  bodyWidth: number;
  /** Pomery strán (šírka / výška): kľúč 0 = predvolený pre dokument. */
  aspects: ReadonlyMap<number, number>;
  zoom: number;
  currentPage: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  pageElsRef: RefObject<Map<number, HTMLDivElement>>;
  /** Getter, lebo `zoomTo` je v karte deklarované až pod volaním hooku. */
  zoomTo: () => (zoom: number) => void;
}

/** Horizontálny padding obsahu karty (`px-3` z oboch strán). */
const CONTENT_PADDING_PX = 24;

/**
 * Vykoná čakajúci výrez pre túto kartu: najprv zoom, po jeho commite posun
 * (kotva zoomu z `zoomTo` sa tým prepíše). Efekt beží po každom renderi a bez
 * čakajúceho výrezu hneď skončí.
 */
export function useAimDocRegion(v: DocRegionViewInputs): void {
  const request = useAimDocRegionStore((s) => (s.request?.docId === v.docId ? s.request : null));
  const zoomedRef = useRef<number | null>(null);
  useEffect(() => {
    const root = v.scrollRef.current;
    if (!request || !v.pdf || v.bodyWidth <= 0 || !root) return;
    const page = request.page ?? v.currentPage;
    const viewport = { width: root.clientWidth, height: root.clientHeight };
    if (zoomedRef.current !== request.nonce) {
      zoomedRef.current = request.nonce;
      const aspect = v.aspects.get(page) ?? v.aspects.get(0) ?? 1 / 1.414;
      const target = regionZoom(request.region, v.bodyWidth - CONTENT_PADDING_PX, viewport, aspect);
      if (Math.abs(target - v.zoom) > 1e-3) {
        v.zoomTo()(target);
        return; // posun až v ďalšom behu, keď je strana v novej veľkosti
      }
    }
    const el = v.pageElsRef.current?.get(page);
    if (!el) return;
    const rootRect = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pos = regionScroll(
      request.region,
      {
        left: root.scrollLeft + (r.left - rootRect.left),
        top: root.scrollTop + (r.top - rootRect.top),
        width: r.width,
        height: r.height,
      },
      viewport,
    );
    root.scrollLeft = pos.left;
    root.scrollTop = pos.top;
    useAimDocRegionStore.getState().clear(request.nonce);
  });
}
