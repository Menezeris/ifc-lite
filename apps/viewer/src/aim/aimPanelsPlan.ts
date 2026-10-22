/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Panely z chatu (AIM D-127, #179): `SET_PANELS` otvorí, zavrie alebo prepne
 * panely viewera a `view_state` / `APPLIED` vráti stav všetkých. Tu je rozpis akcií
 * a opis stavu, bez store (mená a validácia drôtu sú vo `view-protocol.ts`, vykonanie
 * v `aimPanels.ts`, lenivo cez `useAimViewCommands`).
 *
 * Mená na drôte -> panel upstreamu: `lens` -> `lens`, `properties` -> `properties`,
 * `underlays` -> `drawing-underlay`, `documents` -> `documents`, `lists` -> `lists`
 * (spodný pás), `model_tree` -> `hierarchy` (ľavý stĺpec), `drawing` -> `drawing` (spodný pás:
 * 2D výkres aktuálneho rezu generovaný z modelu, bez podkladu; AIM D-136). `all` = všetky.
 */

import { PANEL_KEYS, type PanelKey, type PanelsRequest } from './view-protocol.js';

export { PANEL_KEYS, type PanelKey, type PanelsRequest };

/** Panel upstreamu (`WorkspacePanelId`) pre meno na drôte. */
export const PANEL_ID = {
  lens: 'lens',
  properties: 'properties',
  underlays: 'drawing-underlay',
  documents: 'documents',
  lists: 'lists',
  model_tree: 'hierarchy',
  drawing: 'drawing',
} as const satisfies Record<PanelKey, string>;

/**
 * Konečné kroky: `all` zavrie všetky panely okrem tých, ktoré správa výslovne
 * otvára ("zavri všetko okrem 3D a vlastností"); `toggle` sa rozhodne podľa stavu.
 * Zatváranie ide pred otváraním, aby otvorený panel nezavrel spoločný slot.
 */
export function planPanels(req: PanelsRequest, isOpen: (key: PanelKey) => boolean): { key: PanelKey; open: boolean }[] {
  const want = new Map<PanelKey, boolean>();
  if (req.all === 'close') for (const k of PANEL_KEYS) want.set(k, false);
  for (const k of PANEL_KEYS) {
    const a = req[k];
    if (a === 'open') want.set(k, true);
    else if (a === 'close') want.set(k, false);
    else if (a === 'toggle') want.set(k, !isOpen(k));
  }
  const steps = [...want].map(([key, open]) => ({ key, open }));
  return [...steps.filter((s) => !s.open), ...steps.filter((s) => s.open)];
}

/** Stav store, z ktorého sa číta, kde panel je (podmnožina `ViewerState`). */
export interface PanelsStateLike {
  leftPanelCollapsed: boolean;
  sidebarMode: string;
  sidebarActivePanel: string;
  sidebarSecondaryPanel: string | null;
  sidebarWidthPct: number;
  floatingPanels: ReadonlyArray<{ id: string; snap: string; w: number; h: number }>;
  poppedOutIds: ReadonlyArray<string>;
  listPanelVisible: boolean;
  drawing2DPanelVisible: boolean;
}

export interface PanelInfo {
  open: boolean;
  /** left | right | bottom = ukotvený, floating = plávajúce okno (snap, w, h px), window = samostatné okno. */
  where?: 'left' | 'right' | 'bottom' | 'floating' | 'window';
  snap?: string;
  size?: { w: number; h: number };
}

/** Kde je panel (`key`) podľa stavu store. */
export function panelInfo(s: PanelsStateLike, key: PanelKey): PanelInfo {
  const id = PANEL_ID[key];
  if (key === 'model_tree') return s.leftPanelCollapsed ? { open: false } : { open: true, where: 'left' };
  const floating = s.floatingPanels.find((p) => p.id === id);
  if (floating) return { open: true, where: 'floating', snap: floating.snap, size: { w: Math.round(floating.w), h: Math.round(floating.h) } };
  if (s.poppedOutIds.includes(id)) return { open: true, where: 'window' };
  if (key === 'lists') return s.listPanelVisible ? { open: true, where: 'bottom' } : { open: false };
  if (key === 'drawing') return s.drawing2DPanelVisible ? { open: true, where: 'bottom' } : { open: false };
  const docked = s.sidebarMode !== 'collapsed' && (s.sidebarActivePanel === id || s.sidebarSecondaryPanel === id);
  return docked ? { open: true, where: 'right' } : { open: false };
}

/** Stav všetkých panelov pre `view_state` a `APPLIED` (+ šírka pravého stĺpca v % okna). */
export function describePanels(s: PanelsStateLike): Record<PanelKey, PanelInfo> & { right_width_pct: number | null } {
  const out = {} as Record<PanelKey, PanelInfo>;
  for (const k of PANEL_KEYS) out[k] = panelInfo(s, k);
  return { ...out, right_width_pct: s.sidebarMode === 'collapsed' ? null : Math.round(s.sidebarWidthPct) };
}
