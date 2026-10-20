/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výrez strany PDF karty z chatu (AIM D-117): host pošle DOCUMENT_OPEN s
 * `region` (zlomky strany 0-1, počiatok vľavo hore) a karta sa priblíži tak,
 * aby výrez vyplnil plochu, a vycentruje ho. Upstream `docJump` nesie len
 * stranu, preto má výrez vlastný store; PdfDocumentView volá len
 * `useAimDocRegion` (jeden riadok v bloku AIM-FORK, súbor je na limite veľkosti).
 *
 * Rámiky okolo nájdeného textu (AIM D-123): DOCUMENT_OPEN môže niesť aj
 * `highlights` (obdĺžniky v zlomkoch strany, napr. riadky zo search_documents).
 * Hook ich nakreslí ako vrstvu nad stranou (vedľa textovej vrstvy pdf.js, tiež
 * imperatívne) a drží ich, kým nepríde ďalší DOCUMENT_OPEN.
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

/** Najviac rámikov naraz; viac by výkres zakrylo. */
export const MAX_HIGHLIGHTS = 20;
/** Najmenší rámik (0,1 % strany): riadok textu býva vysoký 0,4-1 %. */
const MIN_HIGHLIGHT = 0.001;

/** Rámiky z drôtu (nedôveryhodný postMessage): neplatné vynechá, najviac MAX_HIGHLIGHTS. */
export function normalizeDocHighlights(raw: unknown): DocRegion[] {
  if (!Array.isArray(raw)) return [];
  const out: DocRegion[] = [];
  for (const item of raw.slice(0, MAX_HIGHLIGHTS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const nums = [r.x, r.y, r.w, r.h];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    const [x0, y0, w0, h0] = nums as number[];
    if (w0 <= 0 || h0 <= 0 || x0 >= 1 || y0 >= 1 || x0 + w0 <= 0 || y0 + h0 <= 0) continue;
    const x = clamp(x0, 0, 1 - MIN_HIGHLIGHT);
    const y = clamp(y0, 0, 1 - MIN_HIGHLIGHT);
    out.push({
      x,
      y,
      // Časť pred okrajom strany sa odreže; rozmer vnútri strany ostáva presný.
      w: clamp(x0 < 0 ? x0 + w0 : w0, MIN_HIGHLIGHT, 1 - x),
      h: clamp(y0 < 0 ? y0 + h0 : h0, MIN_HIGHLIGHT, 1 - y),
    });
  }
  return out;
}

/** Inline štýl rámiku v % strany (rodič = element strany, `position: relative`). */
export function highlightStyle(r: DocRegion): Record<'left' | 'top' | 'width' | 'height', string> {
  const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;
  return { left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) };
}

export interface DocHighlights {
  docId: string;
  /** Strana rámikov; bez nej strana, na ktorej karta je pri prvom kreslení. */
  page?: number;
  rects: DocRegion[];
  nonce: number;
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
  /** Rámiky okolo textu (D-123); null = žiadne. */
  highlights: DocHighlights | null;
  requestRegion: (docId: string, region: DocRegion, page?: number) => void;
  /** Nahradí rámiky; prázdny zoznam ich zruší (každý DOCUMENT_OPEN). */
  setHighlights: (docId: string, rects: DocRegion[], page?: number) => void;
  clear: (nonce: number) => void;
}

export const useAimDocRegionStore = create<DocRegionState>((set, get) => ({
  request: null,
  highlights: null,
  setHighlights: (docId, rects, page) =>
    set({
      highlights:
        rects.length === 0
          ? null
          : {
              docId,
              rects,
              ...(page !== undefined ? { page } : {}),
              nonce: (get().highlights?.nonce ?? 0) + 1,
            },
    }),
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
  const highlights = useAimDocRegionStore((s) => (s.highlights?.docId === v.docId ? s.highlights : null));
  const zoomedRef = useRef<number | null>(null);
  const highlightPageRef = useRef<{ nonce: number; page: number } | null>(null);
  useEffect(() => {
    // Rámiky (D-123): stranu zafixuje prvé kreslenie, aby nepreskakovali pri listovaní.
    if (!highlights) {
      highlightPageRef.current = null;
    } else if (highlightPageRef.current?.nonce !== highlights.nonce) {
      highlightPageRef.current = { nonce: highlights.nonce, page: highlights.page ?? v.currentPage };
    }
    syncHighlightLayer(v.pageElsRef.current, highlights, highlightPageRef.current?.page);
  });
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

const LAYER_ATTR = 'data-aim-highlights';

/**
 * Vrstva rámikov nad stranou (D-123). Imperatívne ako textová vrstva pdf.js:
 * element strany vlastní PdfDocumentView, vrstva je posledné dieťa a React ju
 * nerieši. Kreslí sa znova len pri novom `nonce`; vrstvy na iných stranách zmizne.
 */
function syncHighlightLayer(
  pageEls: Map<number, HTMLDivElement> | null,
  highlights: DocHighlights | null,
  page: number | undefined,
): void {
  if (!pageEls) return;
  for (const [p, el] of pageEls) {
    const layer = el.querySelector<HTMLDivElement>(`:scope > [${LAYER_ATTR}]`);
    const want = highlights && p === page ? String(highlights.nonce) : null;
    if (!want) {
      layer?.remove();
      continue;
    }
    if (layer?.getAttribute(LAYER_ATTR) === want) continue;
    layer?.remove();
    const next = document.createElement('div');
    next.setAttribute(LAYER_ATTR, want);
    Object.assign(next.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3' });
    for (const r of highlights!.rects) {
      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'absolute',
        ...highlightStyle(r),
        outline: '2px solid #f59e0b',
        outlineOffset: '2px',
        background: 'rgba(245, 158, 11, 0.18)',
        borderRadius: '2px',
      });
      next.appendChild(box);
    }
    el.appendChild(next);
  }
}
