/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Store záložiek viewera (AIM D-132). Vlastný malý zustand store ako uložené
 * rezy upstreamu (`savedSectionCutsStore.ts`), nie slice `ViewerState`
 * (`store/index.ts` je na rozpočte veľkosti). Záložky žijú len počas relácie;
 * trvalý je uložený pohľad hosta (D-122). Logika je v `viewTabsPlan.ts`,
 * vykonanie v `viewTabsApply.ts` (lenivo).
 */

import { create } from 'zustand';
import type { StoreyInfo } from '@/hooks/useFloorplanView';
import { initialTabs, type ViewTabsState } from './viewTabsLayout.js';
import type { TileRect, TilesState } from './viewTilesPlan.js';

/** Podlažie, ako ho pozná prepínač pôdorysu (`useViewMode().storeys`). */
export interface TabStorey { guid: string; name: string; info: StoreyInfo }

/** Funkcie viewera pre záložky; dodá ich lišta (hooky `useViewMode` / `useFloorplanView`). */
export interface TabDeps {
  storeys: readonly TabStorey[];
  storeyHasDrawing: (guid: string) => boolean;
  enterDrawingView: (storey: StoreyInfo) => void;
  enterSplitView: (storey: StoreyInfo) => void;
  exitSplitView: () => void;
}

interface ViewTabsStore extends ViewTabsState, TilesState {
  /** Záložka, ktorej stav je práve v 3D canvase (kamera, rez, zámok). */
  sceneId: string;
  deps: TabDeps | null;
  /** Kartu otvoril most (`DOCUMENT_OPEN`): záložku nastaví `showDoc`, nie synchronizácia kariet. */
  bridgeDocId: string | null;
  /** Dlaždice (AIM D-157): obdĺžnik živej 3D dlaždice pre 3D canvas, null = celá plocha. */
  frame: TileRect | null;
  /** Verzia snímok 3D dlaždíc (`tileShots.ts`), aby sa dlaždice prekreslili. */
  shots: number;
}

type TabsModule = typeof import('./viewTabsApply.js');
let tabsModule: TabsModule | null = null;
let tabsLoad: Promise<TabsModule> | null = null;
/** Most ho stiahne pri pripojení, aby príkazy hosta bežali synchrónne a v poradí. */
export const preloadTabs = () => (tabsLoad ??= import('./viewTabsApply.js').then((m) => (tabsModule = m)));

/**
 * Vykoná krok záložiek hneď, keď je modul načítaný: nasledujúce príkazy hosta (rez,
 * kamera po `VIEW_TABS open`) tak patria už novej záložke. Inak po načítaní (Promise pre `track`).
 */
export function withTabs(fn: (m: TabsModule) => Promise<void> | void): Promise<void> | undefined {
  if (tabsModule) {
    // Dlaždice (D-157) vrátia beh snímok, na ktorý most počká pred `APPLIED`.
    return fn(tabsModule) ?? undefined;
  }
  return preloadTabs().then(fn);
}

export const useAimViewTabs = create<ViewTabsStore>(() => ({
  ...initialTabs(), sceneId: '3d', deps: null, bridgeDocId: null, layout: 'single', tiles: [], frame: null, shots: 0,
}));
