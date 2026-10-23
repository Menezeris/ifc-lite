/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ručná oprava odkazu popisku na výkrese (AIM D-160), lenivý modul: menu nad odkazom (Alt+klik,
 * pravé tlačidlo) a označenie textu bez odkazu (Alt+ťah). Vznikne len návrh (`docLinkDraftStore`),
 * ktorý uloží chat; fork nič nezapisuje do DB (D-091, D-098).
 */

import { regionFromDrag } from './docIssueModel.js';
import { buildDraft, setLinkDraft, type LinkDraftAction } from './docLinkDraftStore.js';
import type { DocLink } from './docLinks.js';

type Ctx = { docId: string; page: number };
type Frac = { x: number; y: number; w: number; h: number };

const MENU_ATTR = 'data-aim-link-menu';
const MARK_ATTR = 'data-aim-link-draft';
const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;

const ACTIONS: { action: LinkDraftAction; label: string }[] = [
  { action: 'assign', label: 'Priradiť k vybranému prvku v 3D' },
  { action: 'clear', label: 'Zrušiť odkaz' },
  { action: 'reset', label: 'Vrátiť automatiku' },
];

/** Značka návrhu na strane (prerušovaný rámik), kým chat návrh neuloží alebo ho nenahradí iný. */
function markDraft(pageEl: HTMLElement, r: Frac): void {
  document.querySelectorAll(`[${MARK_ATTR}]`).forEach((n) => n.remove());
  const mark = document.createElement('div');
  mark.setAttribute(MARK_ATTR, '');
  Object.assign(mark.style, {
    position: 'absolute', left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h),
    outline: '2px dashed #d97706', background: 'rgba(217, 119, 6, 0.12)', pointerEvents: 'none', zIndex: '11',
  });
  pageEl.appendChild(mark);
}

function openMenu(host: HTMLElement, at: Frac, title: string, ctx: Ctx, text: string | null, actions: LinkDraftAction[]): void {
  host.querySelectorAll(`:scope > [${MENU_ATTR}]`).forEach((n) => n.remove());
  const box = document.createElement('div');
  box.setAttribute(MENU_ATTR, '');
  Object.assign(box.style, {
    position: 'absolute', left: pct(at.x), top: pct(at.y + at.h), pointerEvents: 'auto', zIndex: '12',
    minWidth: '13rem', padding: '4px', fontSize: '11px', lineHeight: '1.35',
    background: 'var(--background, #fff)', color: 'var(--foreground, #111)', border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  });
  for (const type of ['pointerdown', 'pointerup']) box.addEventListener(type, (e) => e.stopPropagation());
  const head = document.createElement('div');
  head.textContent = `AIM · ${title}`;
  Object.assign(head.style, { padding: '2px 6px', opacity: '0.7', fontWeight: '600' });
  box.appendChild(head);
  for (const a of ACTIONS.filter((x) => actions.includes(x.action))) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = a.label;
    Object.assign(item.style, {
      display: 'block', width: '100%', textAlign: 'left', padding: '2px 6px', borderRadius: '3px',
      background: 'transparent', border: '0', cursor: 'pointer', color: 'inherit', font: 'inherit',
    });
    item.addEventListener('click', () => {
      setLinkDraft(buildDraft(ctx, at, a.action, text));
      const pageEl = host.closest<HTMLElement>('[data-page]') ?? host;
      markDraft(pageEl, at);
      box.remove();
    });
    box.appendChild(item);
  }
  const hint = document.createElement('div');
  hint.textContent = 'Návrh uložíš v chate ("ulož odkaz z výkresu").';
  Object.assign(hint.style, { padding: '2px 6px', opacity: '0.6' });
  box.appendChild(hint);
  host.appendChild(box);
}

/** Menu nad existujúcim odkazom (layer = vrstva odkazov strany). */
export function openLinkMenu(layer: HTMLElement, link: DocLink, ctx: Ctx): void {
  openMenu(layer, link, link.label, ctx, link.label, ['assign', 'clear', 'reset']);
}

/** Alt+ťah: oblasť bez odkazu (text určí host z riadkov strany); klik bez ťahu je zahodený. */
export function draftFromDrag(pageEl: HTMLElement, ctx: Ctx, a: { x: number; y: number }, b: { x: number; y: number }): void {
  const region = regionFromDrag(pageEl.getBoundingClientRect(), a, b);
  if (!region) return;
  markDraft(pageEl, region);
  openMenu(pageEl, region, 'text bez odkazu', ctx, null, ['assign']);
}
