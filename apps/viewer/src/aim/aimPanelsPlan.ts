/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Panely z chatu (AIM D-127, D-150, #179): `SET_PANELS` otvorí, zavrie alebo prepne
 * ľubovoľný panel UI a `view_state` / `APPLIED` vráti stav všetkých. Tu je rozpis akcií
 * a opis stavu, bez store (zoznam panelov je odvodený z registra v `aimPanelList.ts`,
 * validácia drôtu vo `view-protocol.ts`, vykonanie v `aimPanels.ts`, lenivo cez
 * `useAimViewCommands`). `all` = všetky panely.
 */

import { BOTTOM_PANEL_FLAG, isBottomPanel, type BottomPanelFlag } from '@/lib/panels/bottom-panels';
import { sideDockedPanels } from './aimSideDock.js';
import { PANEL_KEYS, isPanelKey, panelCatalog, panelIdOf, type PanelKey } from './aimPanelList.js';
import type { PanelsRequest } from './view-protocol.js';

export { PANEL_KEYS, type PanelKey, type PanelsRequest };

/**
 * Konečné kroky: `all` zavrie všetky panely okrem tých, ktoré správa výslovne
 * otvára ("zavri všetko okrem 3D a vlastností"); `toggle` sa rozhodne podľa stavu.
 * Zatváranie ide pred otváraním, aby otvorený panel nezavrel spoločný slot, a panel
 * vlastností sa zatvára ako posledný (zatvorený panel stĺpca sa vráti na vlastnosti,
 * tie sa zbalia až nakoniec). Neznáme mená sú v `unknown`, nie v krokoch.
 */
export function planPanels(req: PanelsRequest, isOpen: (key: PanelKey) => boolean): { steps: { key: PanelKey; open: boolean }[]; unknown: string[] } {
  const want = new Map<PanelKey, boolean>();
  const unknown = Object.keys(req).filter((k) => k !== 'all' && !isPanelKey(k));
  if (req.all === 'close') for (const k of PANEL_KEYS) want.set(k, false);
  for (const k of PANEL_KEYS) {
    const a = req[k];
    if (a === 'open') want.set(k, true);
    else if (a === 'close') want.set(k, false);
    else if (a === 'toggle') want.set(k, !isOpen(k));
  }
  const steps = [...want].map(([key, open]) => ({ key, open }));
  const closing = steps.filter((s) => !s.open);
  return {
    steps: [...closing.filter((s) => s.key !== 'properties'), ...closing.filter((s) => s.key === 'properties'), ...steps.filter((s) => s.open)],
    unknown,
  };
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
}

/** Stav store s príznakmi spodného pásu (každý panel pásu má vlastný príznak, `bottom-panels.ts`). */
export type PanelsStore = PanelsStateLike & Partial<Record<BottomPanelFlag, boolean>>;

export interface PanelInfo {
  open: boolean;
  /** left | right | bottom = ukotvený, floating = plávajúce okno (snap, w, h px), window = samostatné okno. */
  where?: 'left' | 'right' | 'bottom' | 'floating' | 'window';
  snap?: string;
  size?: { w: number; h: number };
  /** Domov panela: side = pravý stĺpec, bottom = spodný pás, left = ľavý stĺpec. */
  home?: string;
  /** Klávesová skratka (Alt+N podľa registra), ak ju panel má. */
  shortcut?: string;
}

/** Kde je panel (`key`) podľa stavu store. */
export function panelInfo(s: PanelsStore, key: PanelKey): PanelInfo {
  const id = panelIdOf(key);
  if (id === 'hierarchy') return s.leftPanelCollapsed ? { open: false } : { open: true, where: 'left' };
  const floating = s.floatingPanels.find((p) => p.id === id);
  if (floating) return { open: true, where: 'floating', snap: floating.snap, size: { w: Math.round(floating.w), h: Math.round(floating.h) } };
  if (s.poppedOutIds.includes(id)) return { open: true, where: 'window' };
  if (isBottomPanel(id)) return s[BOTTOM_PANEL_FLAG[id]] === true ? { open: true, where: 'bottom' } : { open: false };
  const { primary, secondary } = sideDockedPanels({
    sidebarMode: s.sidebarMode,
    sidebarActivePanel: s.sidebarActivePanel,
    sidebarSecondaryPanel: s.sidebarSecondaryPanel,
    detached: new Set([...s.floatingPanels.map((p) => p.id), ...s.poppedOutIds]),
  });
  return id === primary || id === secondary ? { open: true, where: 'right' } : { open: false };
}

/**
 * Stav všetkých panelov UI pre `view_state` a `APPLIED` (+ šírka pravého stĺpca v % okna): každý panel
 * registra s `open`, `where`, domovom a klávesovou skratkou, aby chat vedel, aké panely existujú.
 */
export function describePanels(s: PanelsStore): Record<PanelKey, PanelInfo | number | null> {
  const out = {} as Record<PanelKey, PanelInfo>;
  for (const row of panelCatalog()) {
    out[row.key] = { ...panelInfo(s, row.key), home: row.home, ...(row.shortcut ? { shortcut: row.shortcut } : {}) };
  }
  return { ...out, right_width_pct: s.sidebarMode === 'collapsed' ? null : Math.round(s.sidebarWidthPct) };
}

/** Zoznam platných mien pre hlásenie neznámeho panela. */
export const validPanelNames = (): string => PANEL_KEYS.join(', ');
