/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Popisky na výkrese ako odkazy na prvok (AIM D-130). Host spáruje bubliny a kódy
 * miestností z textovej vrstvy PDF s prvkami (AIM vrstva: odvodenie, nie IFC) a pošle
 * `DOCUMENT_LINKS` (oblasti v zlomkoch strany, ciele s GUID). Táto vrstva ich nakreslí
 * nad stranou karty ako klikateľné oblasti (imperatívne, ako rámiky D-123 v docRegion)
 * a klik vyberie prvok ako klik do modelu (D-082) a otvorí panel vlastností. Viac
 * kandidátov = malý výber. Fork nič nepočíta, len kreslí a vyberá (D-091, D-098).
 */

import { useEffect, type RefObject } from 'react';
import { create } from 'zustand';
import { SOURCE } from './bridge-protocol.js';
import { setLinkDraft } from './docLinkDraftStore.js';

export interface DocLinkTarget {
  guid: string;
  ref: string;
  name?: string;
  /** Zóna (IfcZone) bez geometrie: GUIDy jej miestností, klik vyberie prvú, ktorá je vo vieweri (AIM D-160). */
  members?: string[];
}

/** Oblasť popisku v zlomkoch strany (0-1, počiatok vľavo hore). */
export interface DocLink {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  status: 'unique' | 'candidates';
  targets: DocLinkTarget[];
  /** Ručné priradenie z chatu (AIM D-160), nie odvodenie z popisku. */
  manual?: boolean;
  /** Značka typu s viac výskytmi: klik otvorí tento IFC typ, `targets` sú vedľajšia voľba. */
  type?: DocLinkTarget;
}

export interface DocLinksMessage {
  source: typeof SOURCE;
  type: 'DOCUMENT_LINKS';
  documents: unknown[];
}

/** Najviac oblastí na stranu (pôdorys 1NP ich má okolo 100) a kandidátov na oblasť. */
export const MAX_LINKS_PER_PAGE = 600;
export const MAX_TARGETS = 12;
export const MAX_MEMBERS = 40;
const MAX_TEXT = 80;

export function isDocLinksMessage(data: unknown): data is DocLinksMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as { source?: unknown; type?: unknown; documents?: unknown };
  return msg.source === SOURCE && msg.type === 'DOCUMENT_LINKS' && Array.isArray(msg.documents);
}

/** Vybaví `DOCUMENT_LINKS`; false = správa sem nepatrí. */
export function handleDocLinksMessage(data: unknown): boolean {
  if (!isDocLinksMessage(data)) return false;
  useAimDocLinksStore.getState().setDocuments(data.documents);
  return true;
}

/**
 * Origin hosta ako v AimBridge: z referrera; bez neho len kontrola rodiča.
 * Pre test sa dá podať `referrer`.
 */
export function acceptsDocLinksEvent(
  e: { source: unknown; origin: string },
  parent: unknown,
  referrer: string,
): boolean {
  if (e.source !== parent) return false;
  if (!referrer) return true;
  try {
    return e.origin === new URL(referrer).origin;
  } catch {
    return false;
  }
}

let listening = false;
/** Výber prvku podľa GUID ako klik do modelu; dodá ho docBridge (store a výber ťahajú WASM). */
let selectGuid: (guid: string) => boolean = () => false;

/**
 * Vlastný poslucháč `DOCUMENT_LINKS` (nie v AimBridge: strop veľkosti a `isInboundMessage`
 * v bridge-protocol neznáme typy odmietne). Rovnaká kontrola rodiča a originu ako most;
 * zapne ho `wireDocumentEvents` v docBridge.ts a podá výber prvku (AIM D-082).
 */
export function listenDocLinks(select: (guid: string) => boolean): void {
  selectGuid = select;
  if (listening || typeof window === 'undefined' || window.parent === window) return;
  listening = true;
  window.addEventListener('message', (e) => {
    if (acceptsDocLinksEvent(e, window.parent, document.referrer)) handleDocLinksMessage(e.data);
  });
}

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : null;
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function normalizeTarget(raw: unknown): DocLinkTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const guid = text(t.guid);
  const ref = text(t.ref);
  if (!guid || !ref) return null;
  const name = text(t.name);
  const members = (Array.isArray(t.members) ? t.members : [])
    .map(text)
    .filter((m): m is string => m !== null)
    .slice(0, MAX_MEMBERS);
  return { guid, ref, ...(name ? { name } : {}), ...(members.length > 0 ? { members } : {}) };
}

function normalizeLink(raw: unknown): DocLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (![l.x, l.y, l.w, l.h].every(unit)) return null;
  const [x0, y0, w0, h0] = [l.x, l.y, l.w, l.h] as number[];
  if (w0 <= 0 || h0 <= 0 || x0 >= 1 || y0 >= 1 || x0 + w0 <= 0 || y0 + h0 <= 0) return null;
  const targets = (Array.isArray(l.targets) ? l.targets : [])
    .map(normalizeTarget)
    .filter((t): t is DocLinkTarget => t !== null)
    .slice(0, MAX_TARGETS);
  if (targets.length === 0) return null;
  const type = targets.length > 1 ? normalizeTarget(l.type) : null;
  const x = Math.max(0, x0);
  const y = Math.max(0, y0);
  return {
    x,
    y,
    // Mimo strany sa oreže, vnútri ostáva rozmer presný.
    w: x0 < 0 || x0 + w0 > 1 ? Math.min(x0 + w0, 1) - x : w0,
    h: y0 < 0 || y0 + h0 > 1 ? Math.min(y0 + h0, 1) - y : h0,
    label: text(l.label) ?? targets[0].ref,
    status: targets.length > 1 ? 'candidates' : 'unique',
    targets,
    ...(l.manual === true ? { manual: true } : {}),
    ...(type ? { type } : {}),
  };
}

/** Kľúč strany dokumentu v store. */
export const pageKey = (docId: string, page: number) => `${docId}#${page}`;

/** `documents` z drôtu (nedôveryhodný postMessage) -> oblasti po stranách. */
export function normalizeDocLinks(documents: readonly unknown[]): Map<string, DocLink[]> {
  const out = new Map<string, DocLink[]>();
  for (const raw of documents) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;
    const docId = text(d.documentId);
    const page = d.page;
    if (!docId || typeof page !== 'number' || !Number.isInteger(page) || page < 1) continue;
    const links = (Array.isArray(d.links) ? d.links : [])
      .slice(0, MAX_LINKS_PER_PAGE)
      .map(normalizeLink)
      .filter((l): l is DocLink => l !== null);
    if (links.length > 0) out.set(pageKey(docId, page), links);
  }
  return out;
}

/** Popis oblasti (title): kam vedie a že je to odvodenie AIM, nie údaj z IFC. */
export function linkTitle(link: DocLink): string {
  const [first] = link.targets;
  const to = link.type
    ? `typ ${link.type.ref}${link.type.name ? ` ${link.type.name}` : ''}, výskyty na podlaží: ${link.targets.length}`
    : link.status === 'unique'
      ? `${first.ref}${first.name ? ` ${first.name}` : ''}`
      : `kandidáti (${link.targets.length}): ${link.targets.map((t) => t.ref).join(', ')}`;
  return `${link.label} -> ${to} (${link.manual ? 'AIM: ručne priradené' : 'AIM: odvodené z popisku'})`;
}

interface DocLinksState {
  pages: Map<string, DocLink[]>;
  /** Mení sa pri každej správe, vrstvy sa prekreslia. */
  nonce: number;
  setDocuments: (documents: readonly unknown[]) => void;
}

export const useAimDocLinksStore = create<DocLinksState>((set, get) => ({
  pages: new Map(),
  nonce: 0,
  setDocuments: (documents) => {
    // Nové odkazy z hosta (aj po uložení opravy v chate): návrh opravy a jeho značka končia (AIM D-160).
    setLinkDraft(null);
    if (typeof document !== 'undefined') document.querySelectorAll('[data-aim-link-draft]').forEach((n) => n.remove());
    set({ pages: normalizeDocLinks(documents), nonce: get().nonce + 1 });
  },
}));

/**
 * Vyber prvok odkazu; false = prvok nie je v načítaných modeloch (alebo výber ešte nie je napojený).
 * Zóna bez geometrie vyberie prvú svoju miestnosť, ktorá vo vieweri je (AIM D-160).
 */
const selectDocLinkTarget = (t: DocLinkTarget): boolean => selectGuid(t.guid) || (t.members ?? []).some(selectGuid);

const LAYER_ATTR = 'data-aim-links';
const PICKER_ATTR = 'data-aim-link-picker';
const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;

/** Ukáž, že prvok vo vieweri nie je (napr. model ešte nebol načítaný). */
function flagMissing(el: HTMLElement): void {
  el.style.background = 'rgba(239, 68, 68, 0.25)';
  el.title = `${el.title} - prvok nie je v načítaných modeloch`;
}

function stopPointer(el: HTMLElement): void {
  // Karta sa ťahaním posúva; klik na odkaz ju posúvať nemá.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('pointerup', (e) => e.stopPropagation());
}

function openPicker(layer: HTMLElement, link: DocLink): void {
  const prev = layer.querySelector(`:scope > [${PICKER_ATTR}]`);
  const same = prev?.getAttribute(PICKER_ATTR) === link.label + pct(link.x) + pct(link.y);
  prev?.remove();
  if (same) return; // druhý klik výber zavrie
  const box = document.createElement('div');
  box.setAttribute(PICKER_ATTR, link.label + pct(link.x) + pct(link.y));
  Object.assign(box.style, {
    position: 'absolute', left: pct(link.x), top: pct(link.y + link.h), pointerEvents: 'auto', zIndex: '1',
    minWidth: '11rem', maxWidth: '16rem', padding: '4px', fontSize: '11px', lineHeight: '1.35',
    background: 'var(--background, #fff)', color: 'var(--foreground, #111)', border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  });
  stopPointer(box);
  const head = document.createElement('div');
  head.textContent = `AIM · ${link.label} · kandidáti na podlaží: ${link.targets.length}`;
  Object.assign(head.style, { padding: '2px 6px', opacity: '0.7', fontWeight: '600' });
  box.appendChild(head);
  for (const t of link.targets) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = t.name ? `${t.ref} ${t.name}` : t.ref;
    Object.assign(item.style, {
      display: 'block', width: '100%', textAlign: 'left', padding: '2px 6px', borderRadius: '3px',
      background: 'transparent', border: '0', cursor: 'pointer', color: 'inherit', font: 'inherit',
    });
    item.addEventListener('click', () => {
      if (selectDocLinkTarget(t)) box.remove();
      else flagMissing(item);
    });
    box.appendChild(item);
  }
  layer.appendChild(box);
}

function linkBox(layer: HTMLElement, link: DocLink, ctx: { docId: string; page: number }): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.title = linkTitle(link);
  Object.assign(el.style, {
    position: 'absolute', left: pct(link.x), top: pct(link.y), width: pct(link.w), height: pct(link.h),
    pointerEvents: 'auto', cursor: 'pointer', borderRadius: '2px',
    background: link.status === 'unique' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(59, 130, 246, 0.18)',
    boxShadow: `inset 0 -2px 0 0 ${link.status === 'unique' ? 'rgba(16, 185, 129, 0.6)' : 'rgba(59, 130, 246, 0.6)'}`,
  });
  stopPointer(el);
  const activate = () => {
    // Značka typu: otvor IFC typ; výber výskytov je záloha, keď typ vo vieweri nie je.
    if (link.type && selectDocLinkTarget(link.type)) return;
    if (link.status === 'candidates') openPicker(layer, link);
    else if (!selectDocLinkTarget(link.targets[0])) flagMissing(el);
  };
  // Alt+klik alebo pravé tlačidlo: ručná oprava odkazu (AIM D-160, lenivý modul docLinkDraft).
  const edit = () => void import('./docLinkDraft.js').then((m) => m.openLinkMenu(layer, link, ctx));
  el.addEventListener('click', (e) => (e.altKey ? edit() : activate()));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    edit();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (e.altKey) edit();
    else activate();
  });
  return el;
}

const armed = new WeakSet<HTMLElement>();

/**
 * Alt+ťah na strane označí text bez odkazu pre ručné priradenie (AIM D-160). Modul návrhu sa
 * načíta až pri prvom geste; koniec ťahu sa zachytí hneď, aby ho rýchle gesto nestratilo.
 */
function armDraft(pageEl: HTMLElement, docId: string, page: number): void {
  if (armed.has(pageEl)) return;
  armed.add(pageEl);
  pageEl.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.altKey || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const from = { x: e.clientX, y: e.clientY };
      const loaded = import('./docLinkDraft.js');
      window.addEventListener(
        'pointerup',
        (u) => void loaded.then((m) => m.draftFromDrag(pageEl, { docId, page }, from, { x: u.clientX, y: u.clientY })),
        { once: true },
      );
    },
    true,
  );
}

/** Vrstva odkazov nad každou vykreslenou stranou dokumentu; prekreslí sa pri novej správe. */
function syncLinkLayers(pageEls: Map<number, HTMLDivElement> | null, docId: string, state: DocLinksState): void {
  if (!pageEls) return;
  for (const [page, el] of pageEls) {
    armDraft(el, docId, page);
    const layer = el.querySelector<HTMLDivElement>(`:scope > [${LAYER_ATTR}]`);
    const links = state.pages.get(pageKey(docId, page));
    if (!links) {
      layer?.remove();
      continue;
    }
    if (layer?.getAttribute(LAYER_ATTR) === String(state.nonce)) continue;
    layer?.remove();
    const next = document.createElement('div');
    next.setAttribute(LAYER_ATTR, String(state.nonce));
    // Nad výrezovým plátnom karty (ako odkazy D-076), pod rámikmi by klik nešiel.
    Object.assign(next.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '10' });
    for (const link of links) next.appendChild(linkBox(next, link, { docId, page }));
    el.appendChild(next);
  }
}

/** Kreslí odkazy z popiskov nad stranami karty (volá useAimDocRegion, AIM-FORK blok). */
export function useAimDocLinks(docId: string, pageElsRef: RefObject<Map<number, HTMLDivElement>>): void {
  const state = useAimDocLinksStore();
  useEffect(() => {
    syncLinkLayers(pageElsRef.current, docId, state);
  });
}
