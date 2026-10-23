/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Návrh ručnej opravy odkazu popisku na výkrese (AIM D-160). Viewer nemá token na zápis, preto
 * návrh len drží a hlási vo `view_state.link_draft`; uloží ho chat (`open_drawing link={from_draft}`),
 * ako pripomienky D-158. Cieľ priradenia je prvok vybraný v 3D (host ho číta z `selection`).
 */

export type LinkDraftAction = 'assign' | 'clear' | 'reset';

/** Oblasť v % strany, počiatok vľavo hore (tvar `open_drawing region`). */
export interface DraftRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LinkDraft {
  document_id: string;
  page: number;
  /** Text popisku; null = text pod oblasťou určí host z riadkov strany. */
  text: string | null;
  bbox: DraftRegion;
  action: LinkDraftAction;
}

let draft: LinkDraft | null = null;
const listeners = new Set<() => void>();

export const getLinkDraft = (): LinkDraft | null => draft;

export function setLinkDraft(next: LinkDraft | null): void {
  draft = next;
  for (const l of listeners) l();
}

export function onLinkDraftChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const pct = (v: number) => +(v * 100).toFixed(2);

/** Oblasť zo zlomkov strany (0-1) na percentá. */
export function regionToPct(r: { x: number; y: number; w: number; h: number }): DraftRegion {
  return { x: pct(r.x), y: pct(r.y), width: pct(r.w), height: pct(r.h) };
}

/** Návrh pre oblasť (zlomky) a akciu; text prázdny = null. */
export function buildDraft(
  ctx: { docId: string; page: number },
  region: { x: number; y: number; w: number; h: number },
  action: LinkDraftAction,
  text: string | null,
): LinkDraft {
  return {
    document_id: ctx.docId,
    page: ctx.page,
    text: text && text.trim() ? text.trim() : null,
    bbox: regionToPct(region),
    action,
  };
}
