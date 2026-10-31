/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Kreslenie pripomienky nad stranou PDF (AIM D-158, značky AIM #199). Nástroj
 * "oblasť" je obdĺžnik D-158: pustenie hneď otvorí formulár témy. Značky
 * (obláčik, šípka, text, pin) sa zbierajú do konceptu na jednej strane;
 * "Hotovo" (alebo Enter) otvorí formulár s oblasťou okolo značiek. Ťah oblasti
 * na strane s konceptom vezme značky so sebou. Escape kreslenie zruší.
 */

import { highlightStyle } from './docRegion.js';
import { regionFromDrag, type DocIssueTarget } from './docIssueModel.js';
import { markupBounds, markupFromDrag, type MarkupShape } from './docMarkup.js';
import { markupSvg, pageAspect } from './docMarkupSvg.js';
import { useAimDocIssueStore } from './docIssues.js';

const DRAFT_ATTR = 'data-aim-doc-issue-draft';

let activeFinish: (() => void) | null = null;

/** Tlačidlo "Hotovo": koncept značiek do formulára témy. */
export function finishIssueDraft(): void {
  activeFinish?.();
}

/**
 * Zachytí stlačenie skôr než posun ťahaním (AIM #213), kreslí náhľad a vráti cieľ
 * (null = zrušené). Nástroj sa číta zo store pri každom stlačení.
 */
export function attachIssueDrawing(root: HTMLElement, docId: string, onDone: (t: DocIssueTarget | null) => void): () => void {
  let start: { x: number; y: number; pageEl: HTMLElement; box: HTMLDivElement } | null = null;
  let draft: { pageEl: HTMLElement; shapes: MarkupShape[]; layer: HTMLDivElement } | null = null;
  let input: HTMLInputElement | null = null;
  const store = () => useAimDocIssueStore.getState();
  const prevCursor = root.style.cursor;
  root.style.cursor = 'crosshair';

  const renderDraft = (pageEl: HTMLElement, extra: MarkupShape | null) => {
    if (!draft || draft.pageEl !== pageEl) {
      draft?.layer.remove();
      const layer = document.createElement('div');
      layer.setAttribute(DRAFT_ATTR, '');
      Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '5' });
      pageEl.appendChild(layer);
      draft = { pageEl, shapes: [], layer };
    }
    draft.layer.replaceChildren(markupSvg(extra ? [...draft.shapes, extra] : draft.shapes, pageAspect(pageEl), true));
  };
  const addShape = (pageEl: HTMLElement, shape: MarkupShape | null) => {
    renderDraft(pageEl, null);
    if (!shape || !draft) return;
    draft.shapes.push(shape);
    renderDraft(pageEl, null);
    store().set({ draftCount: draft.shapes.length });
  };
  const pageNo = (pageEl: HTMLElement) => Number(pageEl.dataset.page) || 1;

  const finish = () => {
    if (!draft?.shapes.length) return;
    const { pageEl, shapes } = draft;
    onDone({ docId, page: pageNo(pageEl), region: markupBounds(shapes), markup: [...shapes] });
  };
  activeFinish = finish;

  const askText = (pageEl: HTMLElement, a: { x: number; y: number }) => {
    input?.remove();
    const rect = pageEl.getBoundingClientRect();
    const field = document.createElement('input');
    field.type = 'text';
    field.maxLength = 200;
    field.placeholder = 'Text značky, Enter';
    field.setAttribute('aria-label', 'Text značky');
    Object.assign(field.style, {
      position: 'absolute', left: `${a.x - rect.left}px`, top: `${a.y - rect.top}px`, transform: 'translateY(-100%)',
      zIndex: '6', font: '12px system-ui, sans-serif', border: '1px solid #dc2626', padding: '1px 4px', minWidth: '10em',
    });
    let closed = false;
    const commit = (keep: boolean) => {
      if (closed) return;
      closed = true;
      const text = field.value;
      field.remove();
      if (input === field) input = null;
      if (keep) addShape(pageEl, markupFromDrag('text', rect, a, a, text));
    };
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
    field.addEventListener('blur', () => commit(true));
    pageEl.appendChild(field);
    input = field;
    setTimeout(() => field.focus(), 0);
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || e.target instanceof HTMLInputElement) return;
    const pageEl = (e.target as Element | null)?.closest?.<HTMLElement>('[data-page]');
    if (!pageEl || !root.contains(pageEl)) return;
    e.preventDefault();
    e.stopPropagation();
    const box = document.createElement('div');
    box.setAttribute(DRAFT_ATTR, '');
    Object.assign(box.style, { position: 'absolute', outline: '2px dashed #dc2626', background: 'rgba(220, 38, 38, 0.12)', pointerEvents: 'none', zIndex: '5' });
    if (store().tool === 'region') pageEl.appendChild(box);
    start = { x: e.clientX, y: e.clientY, pageEl, box };
  };
  const onMove = (e: PointerEvent) => {
    if (!start) return;
    const tool = store().tool;
    const rect = start.pageEl.getBoundingClientRect();
    const b = { x: e.clientX, y: e.clientY };
    if (tool === 'region') {
      const region = regionFromDrag(rect, start, b);
      Object.assign(start.box.style, region ? highlightStyle(region) : { width: '0', height: '0' });
    } else if (tool === 'cloud' || tool === 'arrow') {
      renderDraft(start.pageEl, markupFromDrag(tool, rect, start, b));
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!start) return;
    const { pageEl, box } = start;
    const a = { x: start.x, y: start.y };
    const b = { x: e.clientX, y: e.clientY };
    const rect = pageEl.getBoundingClientRect();
    box.remove();
    start = null;
    const tool = store().tool;
    if (tool === 'region') {
      // Klik bez ťahu = pripomienka na celú stranu; značky konceptu na tej istej strane idú s ňou.
      const markup = draft?.pageEl === pageEl ? [...draft.shapes] : [];
      onDone({ docId, page: pageNo(pageEl), region: regionFromDrag(rect, a, b), ...(markup.length ? { markup } : {}) });
    } else if (tool === 'text') {
      askText(pageEl, b);
    } else {
      addShape(pageEl, markupFromDrag(tool, rect, a, b));
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onDone(null);
    if (e.key === 'Enter' && draft?.shapes.length) finish();
  };
  root.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  return () => {
    root.style.cursor = prevCursor;
    start?.box.remove();
    draft?.layer.remove();
    input?.remove();
    if (activeFinish === finish) activeFinish = null;
    store().set({ draftCount: 0 });
    root.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
  };
}
