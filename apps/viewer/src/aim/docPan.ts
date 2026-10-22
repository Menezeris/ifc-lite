/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Posun PDF karty ťahaním ľavým tlačidlom myši (AIM #213). Upstream karta sa
 * posúva len kolieskom (natívny scroll) a stredným tlačidlom (autoscroll
 * prehliadača). Ťahanie začne len na prázdnej ploche strany: výber textu
 * (text pdf.js) a klikateľné prvky (odkazy z popiskov D-130, tlačidlá, vstupy)
 * ostávajú nedotknuté. Dotyk sa nemení, ten posúva natívne.
 */

import { capturePointer, releasePointer } from '@/lib/pointer-capture';

/** Posun v px, od ktorého sa gesto berie ako ťahanie (menší je klik). */
export const PAN_THRESHOLD_PX = 4;

const TEXT_SELECTOR = '.pdf-doc-text-layer span';
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]';

/** Najmenšie, čo z cieľa udalosti treba (testovateľné bez DOM). */
export interface PanTarget {
  closest(selector: string): unknown;
}

export interface PanStartEvent {
  button: number;
  pointerType: string;
  target: unknown;
}

/** Môže tento stlačený bod začať ťahanie? Len myš/pero, ľavé tlačidlo, mimo textu a ovládačov. */
export function canStartPan(e: PanStartEvent): boolean {
  if (e.button !== 0) return false;
  if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return false;
  const t = e.target as Partial<PanTarget> | null;
  if (!t || typeof t.closest !== 'function') return false;
  return !t.closest(TEXT_SELECTOR) && !t.closest(INTERACTIVE_SELECTOR);
}

export interface PanState {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  active: boolean;
}

export function startPan(x: number, y: number, scrollLeft: number, scrollTop: number): PanState {
  return { startX: x, startY: y, scrollLeft, scrollTop, active: false };
}

/** Nová poloha scrollu pre aktuálny bod; `active` sa zapne po prekročení prahu a ostane. */
export function movePan(s: PanState, x: number, y: number): { left: number; top: number } | null {
  const dx = x - s.startX;
  const dy = y - s.startY;
  if (!s.active) {
    if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return null;
    s.active = true;
  }
  return { left: s.scrollLeft - dx, top: s.scrollTop - dy };
}

const STYLE_ATTR = 'data-aim-doc-pan-style';
const PANNING_ATTR = 'data-aim-panning';
const CSS = `
.pdf-doc-text-layer { cursor: grab; }
[${PANNING_ATTR}] { user-select: none; }
[${PANNING_ATTR}] .pdf-doc-text-layer, [${PANNING_ATTR}] .pdf-doc-text-layer span { cursor: grabbing !important; }
`;

function ensureStyle(doc: Document): void {
  if (doc.head.querySelector(`style[${STYLE_ATTR}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(STYLE_ATTR, '');
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** Zapojí ťahanie na posuvnú plochu karty; vráti odpojenie. */
export function attachDocPan(root: HTMLElement): () => void {
  ensureStyle(root.ownerDocument);
  let pan: PanState | null = null;
  let pointerId = -1;

  const end = () => {
    if (pan?.active) releasePointer(root, pointerId);
    root.removeAttribute(PANNING_ATTR);
    pan = null;
  };
  const onDown = (e: PointerEvent) => {
    if (!canStartPan(e)) return;
    pan = startPan(e.clientX, e.clientY, root.scrollLeft, root.scrollTop);
    pointerId = e.pointerId;
  };
  const onMove = (e: PointerEvent) => {
    if (!pan || e.pointerId !== pointerId) return;
    if ((e.buttons & 1) === 0) return end(); // tlačidlo pustené mimo karty
    const was = pan.active;
    const to = movePan(pan, e.clientX, e.clientY);
    if (!to) return;
    if (!was) {
      capturePointer(root, pointerId);
      root.setAttribute(PANNING_ATTR, '');
      root.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
    }
    root.scrollLeft = to.left;
    root.scrollTop = to.top;
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  return () => {
    end();
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', end);
    root.removeEventListener('pointercancel', end);
  };
}
