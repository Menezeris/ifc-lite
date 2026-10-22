/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pripomienka na PDF (AIM D-158), väzba na store a DOM. Tlačidlo v lište karty
 * dokumentu (`AimDocumentIssue`) zapne kreslenie; ťah obdĺžnika nad stranou
 * otvorí upstream tok "New topic" BCF panela (to isté tlačidlo, ten istý
 * formulár) a téma, ktorú panel založí, dostane BCF DocumentReference na
 * dokument, stranu a oblasť. Téma ostáva lokálna v paneli; do DB hosta ju
 * uloží chat (`bcf_topic action=from_viewer`). Rámiky s číslom ukazujú
 * pripomienky na strane, klik otvorí tému v paneli.
 * Modul je v lenivom chunku karty dokumentu (DocumentPane), nie vo vstupe.
 */

import { create } from 'zustand';
import { useViewerStore } from '@/store';
import { anchorSelector, TOUR_ANCHORS } from '@/lib/tours/anchors';
import { aimBcfContext } from './bcf-protocol.js';
import { highlightStyle } from './docRegion.js';
import { docIssueReference, issuesOnPage, newTopicGuid, regionFromDrag, type DocIssueTarget } from './docIssueModel.js';

export type DocIssuePhase = 'idle' | 'drawing' | 'form';

interface DocIssueState {
  phase: DocIssuePhase;
  /** Dokument, nad ktorým sa kreslí alebo pre ktorý je otvorený formulár. */
  docId: string | null;
  note: string | null;
  set: (s: Partial<Pick<DocIssueState, 'phase' | 'docId' | 'note'>>) => void;
}

export const useAimDocIssueStore = create<DocIssueState>((set) => ({
  phase: 'idle',
  docId: null,
  note: null,
  set: (s) => set(s),
}));

/** Ako dlho sa čaká na tlačidlo "New topic" po otvorení panela. */
const BUTTON_WAIT_MS = 3000;
/** Neuzavretý formulár po tejto dobe pripomienku pustí (téma by sa nespárovala). */
const FORM_TIMEOUT_MS = 30 * 60_000;
const POLL_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForElement(selector: string, ms: number): Promise<HTMLElement | null> {
  const end = Date.now() + ms;
  for (;;) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
    if (Date.now() > end) return null;
    await sleep(50);
  }
}

let stopWatch: (() => void) | null = null;

function finish(note: string | null): void {
  stopWatch?.();
  stopWatch = null;
  useAimDocIssueStore.getState().set({ phase: 'idle', docId: null, note });
}

/**
 * Otvorí upstream "New topic" a téme, ktorú panel založí, pridá odkaz na PDF.
 * Zrušený formulár (zoznam tém je späť bez novej témy) pripomienku zahodí.
 */
export async function openIssueForm(target: DocIssueTarget, docName: string): Promise<boolean> {
  stopWatch?.();
  const store = useViewerStore.getState();
  store.showWorkspacePanel('bcf', 'programmatic');
  store.setActiveTopic(null);
  const button = await waitForElement(anchorSelector(TOUR_ANCHORS.bcfNewTopic), BUTTON_WAIT_MS);
  if (!button) {
    finish('Panel BCF sa neotvoril; skús pripomienku znova.');
    return false;
  }
  const before = new Set(useViewerStore.getState().bcfProject?.topics.keys() ?? []);
  useAimDocIssueStore.getState().set({ phase: 'form', docId: target.docId, note: null });
  button.click();
  const ref = docIssueReference(aimBcfContext()?.origin ?? null, docName, target);
  const started = Date.now();
  let done = false;
  const attach = (): boolean => {
    if (done) return true;
    const guid = newTopicGuid(before, useViewerStore.getState().bcfProject);
    if (!guid) return false;
    // Najprv odhlásiť: updateTopic synchrónne zavolá odber a ten by pripájal znova.
    done = true;
    finish(null);
    const topic = useViewerStore.getState().bcfProject?.topics.get(guid);
    useViewerStore.getState().updateTopic(guid, { documentReferences: [...(topic?.documentReferences ?? []), ref] });
    return true;
  };
  const unsubscribe = useViewerStore.subscribe((s, prev) => {
    if (s.bcfProject !== prev.bcfProject) attach();
  });
  let timer: ReturnType<typeof setInterval> | null = null;
  stopWatch = () => {
    unsubscribe();
    if (timer) clearInterval(timer);
  };
  timer = setInterval(() => {
    if (attach()) return;
    // Formulár zmizol a zoznam s tlačidlom je späť: používateľ ho zrušil.
    const back = document.querySelector(anchorSelector(TOUR_ANCHORS.bcfNewTopic));
    if ((back && Date.now() - started > POLL_MS) || Date.now() - started > FORM_TIMEOUT_MS) finish(null);
  }, POLL_MS);
  return true;
}

/** Klik na rámik: téma v paneli BCF. */
export function openIssueTopic(guid: string): void {
  const store = useViewerStore.getState();
  store.showWorkspacePanel('bcf', 'programmatic');
  store.setActiveTopic(guid);
}

const LAYER_ATTR = 'data-aim-doc-issues';
const DRAFT_ATTR = 'data-aim-doc-issue-draft';

/** Rámiky pripomienok nad stranami karty (imperatívna vrstva ako rámiky D-123). */
export function syncIssueLayers(root: HTMLElement, docId: string): void {
  const project = useViewerStore.getState().bcfProject;
  for (const pageEl of root.querySelectorAll<HTMLElement>('[data-page]')) {
    const page = Number(pageEl.dataset.page);
    const issues = issuesOnPage(project, docId, page);
    const key = issues.map((i) => `${i.guid}:${i.label}:${JSON.stringify(i.region)}`).join('|');
    let layer = pageEl.querySelector<HTMLDivElement>(`:scope > [${LAYER_ATTR}]`);
    if (!issues.length) {
      layer?.remove();
      continue;
    }
    if (layer?.getAttribute(LAYER_ATTR) === key) continue;
    layer?.remove();
    layer = document.createElement('div');
    layer.setAttribute(LAYER_ATTR, key);
    Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '4' });
    for (const issue of issues) {
      const box = document.createElement('div');
      const r = issue.region ?? { x: 0, y: 0, w: 0.04, h: 0.03 };
      box.setAttribute('role', 'button');
      box.tabIndex = 0;
      box.title = `${issue.label} ${issue.title}${issue.saved ? '' : ' (neuložená, ulož v chate)'}`;
      box.setAttribute('aria-label', `Pripomienka ${issue.label}: ${issue.title}`);
      Object.assign(box.style, {
        position: 'absolute',
        ...highlightStyle(r),
        outline: `2px ${issue.saved ? 'solid' : 'dashed'} #dc2626`,
        background: 'rgba(220, 38, 38, 0.08)',
        pointerEvents: 'auto',
        cursor: 'pointer',
      });
      const badge = document.createElement('span');
      badge.textContent = issue.label;
      Object.assign(badge.style, {
        position: 'absolute', left: '0', top: '0', transform: 'translateY(-100%)',
        background: '#dc2626', color: '#fff', font: '600 11px/1.4 system-ui, sans-serif', padding: '0 4px', borderRadius: '2px',
      });
      box.appendChild(badge);
      const open = () => openIssueTopic(issue.guid);
      box.addEventListener('click', open);
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
      layer.appendChild(box);
    }
    pageEl.appendChild(layer);
  }
}

/**
 * Kreslenie obdĺžnika nad stranou: zachytí stlačenie skôr než posun ťahaním
 * (AIM #213), kreslí náhľad a po pustení vráti cieľ. Escape kreslenie zruší.
 */
export function attachIssueDrawing(root: HTMLElement, docId: string, onDone: (t: DocIssueTarget | null) => void): () => void {
  let start: { x: number; y: number; pageEl: HTMLElement; draft: HTMLDivElement } | null = null;
  const prevCursor = root.style.cursor;
  root.style.cursor = 'crosshair';
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const pageEl = (e.target as Element | null)?.closest?.<HTMLElement>('[data-page]');
    if (!pageEl || !root.contains(pageEl)) return;
    e.preventDefault();
    e.stopPropagation();
    const draft = document.createElement('div');
    draft.setAttribute(DRAFT_ATTR, '');
    Object.assign(draft.style, { position: 'absolute', outline: '2px dashed #dc2626', background: 'rgba(220, 38, 38, 0.12)', pointerEvents: 'none', zIndex: '5' });
    pageEl.appendChild(draft);
    start = { x: e.clientX, y: e.clientY, pageEl, draft };
  };
  const onMove = (e: PointerEvent) => {
    if (!start) return;
    const region = regionFromDrag(start.pageEl.getBoundingClientRect(), start, { x: e.clientX, y: e.clientY });
    Object.assign(start.draft.style, region ? highlightStyle(region) : { width: '0', height: '0' });
  };
  const onUp = (e: PointerEvent) => {
    if (!start) return;
    const { pageEl, draft } = start;
    const region = regionFromDrag(pageEl.getBoundingClientRect(), start, { x: e.clientX, y: e.clientY });
    draft.remove();
    start = null;
    // Klik bez ťahu = pripomienka na celú stranu.
    onDone({ docId, page: Number(pageEl.dataset.page) || 1, region });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onDone(null);
  };
  root.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  return () => {
    root.style.cursor = prevCursor;
    start?.draft.remove();
    root.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
  };
}
