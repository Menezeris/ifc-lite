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
 *
 * Skutočná veľkosť karty (AIM D-127, #166): výrez sa prepočíta, keď sa plocha
 * karty po otvorení zmení (split, ukotvenie, šírka stĺpca) alebo keď prídu
 * skutočné rozmery strany, kým používateľ kartou sám nepohne. Viditeľný rozsah
 * strany (a či je výrez celý v zábere) ide do `view_state` / `APPLIED`.
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
  /** Viditeľný rozsah otvorenej karty (AIM D-127); null = žiadna karta s PDF. */
  visible: DocVisibleState | null;
  /** Rámiky okolo textu (D-123); null = žiadne. */
  highlights: DocHighlights | null;
  /** Vráti `nonce` požiadavky (na čakanie cez `regionApplied`). */
  requestRegion: (docId: string, region: DocRegion, page?: number) => number;
  /** Nahradí rámiky; prázdny zoznam ich zruší (každý DOCUMENT_OPEN). */
  setHighlights: (docId: string, rects: DocRegion[], page?: number) => void;
  clear: (nonce: number) => void;
}

let lastNonce = 0;

/** Čakajúci na vykonanie výrezu podľa `nonce` (APPLIED čaká, kým karta výrez naozaj ukáže). */
const waiters = new Map<number, () => void>();

/** true = výrez s týmto `nonce` sa vykonal do `timeoutMs`. */
export function regionApplied(nonce: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(nonce);
      resolve(false);
    }, timeoutMs);
    waiters.set(nonce, () => {
      clearTimeout(timer);
      waiters.delete(nonce);
      resolve(true);
    });
  });
}

export const useAimDocRegionStore = create<DocRegionState>((set, get) => ({
  request: null,
  visible: null,
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
  requestRegion: (docId, region, page) => {
    const nonce = ++lastNonce;
    set({ request: { docId, region, ...(page !== undefined ? { page } : {}), nonce } });
    return nonce;
  },
  clear: (nonce) => {
    if (get().request?.nonce === nonce) set({ request: null });
    waiters.get(nonce)?.();
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
  /** Posledný výrez z chatu: platí, kým kartou nepohne používateľ (#166). */
  const fitRef = useRef<{ region: DocRegion; page: number; width: number; height: number; aspect: number } | null>(null);
  const zoomRef = useRef(v.zoom);
  zoomRef.current = v.zoom;
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
    const aspect = v.aspects.get(page) ?? v.aspects.get(0) ?? 1 / 1.414;
    if (zoomedRef.current !== request.nonce) {
      zoomedRef.current = request.nonce;
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
    fitRef.current = { region: request.region, page, ...viewport, aspect };
    publishVisible(v.docId, root, v.pageElsRef.current, page, zoomRef.current, request.region);
    useAimDocRegionStore.getState().clear(request.nonce);
  });
  // Plocha karty sa po otvorení mení (split, ukotvenie, šírka stĺpca) a skutočný pomer
  // strany príde až s PDF: výrez z chatu sa vtedy prepočíta, kým kartou nepohne používateľ.
  const aspectKey = fitRef.current ? (v.aspects.get(fitRef.current.page) ?? v.aspects.get(0) ?? 0) : 0;
  useEffect(() => {
    const root = v.scrollRef.current;
    if (!root) return;
    const refit = () => {
      const fit = fitRef.current;
      if (!fit || useAimDocRegionStore.getState().request) return;
      const aspect = v.aspects.get(fit.page) ?? v.aspects.get(0) ?? fit.aspect;
      const moved = Math.abs(root.clientWidth - fit.width) > 2 || Math.abs(root.clientHeight - fit.height) > 2;
      if (moved || Math.abs(aspect - fit.aspect) > 1e-3) useAimDocRegionStore.getState().requestRegion(v.docId, fit.region, fit.page);
    };
    const release = () => {
      fitRef.current = null;
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const page = fitRef.current?.page ?? v.currentPage;
        publishVisible(v.docId, root, v.pageElsRef.current, page, zoomRef.current, fitRef.current?.region);
      });
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refit);
    ro?.observe(root);
    refit();
    const gestures = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
    for (const g of gestures) root.addEventListener(g, release, { passive: true });
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro?.disconnect();
      for (const g of gestures) root.removeEventListener(g, release);
      root.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [v.docId, v.scrollRef, v.pageElsRef, v.currentPage, v.aspects, aspectKey]);
  // Zatvorená karta už nič neukazuje.
  useEffect(() => () => {
    if (useAimDocRegionStore.getState().visible?.document_id === v.docId) useAimDocRegionStore.setState({ visible: null });
  }, [v.docId]);
}

/** Zapíše, čo zo strany `page` je v ploche karty vidno (AIM D-127). */
function publishVisible(
  docId: string,
  root: HTMLElement,
  pageEls: Map<number, HTMLDivElement> | null,
  page: number,
  zoom: number,
  region: DocRegion | undefined,
): void {
  const el = pageEls?.get(page);
  if (!el) return;
  const rootRect = root.getBoundingClientRect();
  const viewport = { left: rootRect.left, top: rootRect.top, width: root.clientWidth, height: root.clientHeight };
  const part = visiblePart(el.getBoundingClientRect(), viewport);
  useAimDocRegionStore.setState({
    visible: {
      document_id: docId,
      page,
      zoom_percent: Math.round(zoom * 100),
      card: { width: Math.round(viewport.width), height: Math.round(viewport.height) },
      visible: part && toPct(part),
      ...(region ? { region: toPct(region), region_fully_visible: regionInside(region, part) } : {}),
    },
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
