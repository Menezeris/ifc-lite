/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Posun a zoom panelov (AIM #183, D-150): `SCROLL_PANEL` z chatu ("posuň dole", "hore",
 * "na začiatok", "na položku X", "na polovicu") pre ľubovoľný panel UI, `ZOOM_PANEL`
 * ("zväčši panel") a udržanie zvýrazneného riadka vo výreze po `SELECT` s `highlight`.
 *
 * Jednorazové `scrollIntoView` riadok minulo: panel po výbere dokresľuje obsah nad ním
 * (atribúty, sady z typu, rozbalenie sady) a riadok sa posunul pod viditeľnú časť.
 * `revealRow` preto po prvom posune sleduje polohu riadka, kým sa panel ustáli,
 * a keď riadok vypadne z výrezu, vycentruje ho znova. Posúva len skrolovací kontajner
 * panela (nie okolité stránky) a skončí pri prvom zásahu používateľa.
 */

import { panelIdOf, isPanelKey, PANEL_KEYS } from './aimPanelList.js';
import { centeredTop, foldText, percentTarget, rowVisible, scrollPercent, scrollTarget, zoomTarget, type PanelScrollRequest, type PanelZoom } from './aimPanelScrollPlan.js';

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

/** Panel bez `panel` v správe = panel vlastností (D-146). */
const DEFAULT_PANEL = 'properties';

/** Posledný posun a zoom od chatu: `view_state.panel_view` povie, kam sa panel dostal. */
interface PanelViewState {
  panel: string;
  scroll_pct: number;
  at_top: boolean;
  at_bottom: boolean;
  zoom: number;
  item?: string;
}
let lastView: PanelViewState | null = null;
const zooms = new Map<string, number>();

/** Zoom panelu sa po zatvorení zabudne (nový obsah vzniká s predvoleným zoomom). */
export function forgetPanelZoom(panel: string): void {
  zooms.delete(panel);
  if (lastView?.panel === panel) lastView = null;
}

/** Stav posledného posunu / zoomu pre `view_state` (null = chat panel zatiaľ neposúval). */
export const panelViewState = (): PanelViewState | null => lastView;

/** Viditeľný koreň obsahu panela: prvý zo značiek `data-aim-panel` (sidebar, plávajúce okno, spodný pás), ktorý má rozmer. */
function panelRoots(panel: string): HTMLElement[] {
  const marks = [...document.querySelectorAll<HTMLElement>(`[data-aim-panel="${panelIdOf(panel)}"]`)];
  const roots = marks.flatMap((m) => [...m.children] as HTMLElement[]);
  return roots.filter((r) => r.getBoundingClientRect().width > 0);
}

/** Skrolovací kontajner panela: panel vlastností cez svoje kotvy, ostatné cez najväčší skrolovateľný prvok v koreni. */
function scrollerFor(panel: string): HTMLElement | null {
  if (panel === DEFAULT_PANEL) {
    const sc = panelScroller();
    if (sc) return sc;
  }
  let best: HTMLElement | null = null;
  for (const root of panelRoots(panel)) {
    for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') || el.clientHeight === 0) continue;
      if (!best || el.clientHeight * el.clientWidth > best.clientHeight * best.clientWidth) best = el;
    }
  }
  return best;
}

/** Najhlbší prvok, ktorého vlastný text obsahuje hľadaný text (bez diakritiky a veľkosti písmen). */
function findItem(sc: HTMLElement, needle: string): Element | null {
  const want = foldText(needle);
  let hit: Element | null = null;
  const walker = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !foldText(n.textContent ?? '').includes(want)) continue;
    if (el.getClientRects().length === 0) continue; // skrytý (zbalená sekcia, display: none)
    hit = el;
    break;
  }
  return hit;
}

function recordView(panel: string, sc: HTMLElement, item?: string): void {
  const pct = scrollPercent(sc.scrollTop, sc.clientHeight, sc.scrollHeight);
  lastView = {
    panel, scroll_pct: pct, at_top: sc.scrollTop <= 1, at_bottom: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1,
    zoom: zooms.get(panel) ?? 1, ...(item ? { item } : {}),
  };
}

/** Pokyn z chatu: posun panela (smer, položka podľa textu, poloha v %). Čo sa nepodarilo, zapíše ako problém pre `APPLIED`. */
export function scrollPanel(req: PanelScrollRequest, noteIssue: (text: string) => void): void {
  cancelReveal();
  const panel = req.panel ?? DEFAULT_PANEL;
  if (!isPanelKey(panel)) return noteIssue(`SCROLL_PANEL: neznámy panel '${panel}' (platné: ${PANEL_KEYS.join(', ')})`);
  const sc = scrollerFor(panel);
  if (!sc) return noteIssue(`SCROLL_PANEL: panel ${panel} nie je otvorený`);
  const behavior = reduceMotion() ? 'auto' : 'smooth';
  if (req.item !== undefined) {
    const row = findItem(sc, req.item);
    if (!row) return noteIssue(`SCROLL_PANEL: položka '${req.item}' sa v paneli ${panel} nenašla (zbalená sekcia sa neprehľadáva)`);
    revealRow(() => row);
    recordView(panel, sc, req.item);
    return;
  }
  if (sc.scrollHeight > sc.clientHeight) {
    const top = req.percent !== undefined
      ? percentTarget(req.percent, sc.clientHeight, sc.scrollHeight)
      : scrollTarget(req.direction ?? 'down', sc.scrollTop, sc.clientHeight, sc.scrollHeight);
    sc.scrollTo({ top, behavior });
    // Stav po dobehnutí animácie: cieľ je známy vopred, preto ho zapíšeme z neho.
    lastView = {
      panel, scroll_pct: scrollPercent(top, sc.clientHeight, sc.scrollHeight), at_top: top <= 1,
      at_bottom: top + sc.clientHeight >= sc.scrollHeight - 1, zoom: zooms.get(panel) ?? 1,
    };
  } else recordView(panel, sc);
}

/** Pokyn z chatu: zoom obsahu panela (CSS `zoom` na jeho koreňoch), zabudne sa so zatvorením panela. */
export function zoomPanel(zoom: PanelZoom, panelName: string | undefined, noteIssue: (text: string) => void): void {
  const panel = panelName ?? DEFAULT_PANEL;
  if (!isPanelKey(panel)) return noteIssue(`ZOOM_PANEL: neznámy panel '${panel}' (platné: ${PANEL_KEYS.join(', ')})`);
  const roots = panelRoots(panel);
  if (roots.length === 0) return noteIssue(`ZOOM_PANEL: panel ${panel} nie je otvorený`);
  const next = zoomTarget(zoom, zooms.get(panel) ?? 1);
  zooms.set(panel, next);
  for (const root of roots) root.style.zoom = next === 1 ? '' : String(next);
  const sc = scrollerFor(panel);
  if (sc) recordView(panel, sc);
}
