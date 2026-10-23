/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Store záložiek viewera (AIM D-132, od D-161 3D a dokumenty). Vlastný malý zustand store ako uložené
 * rezy upstreamu (`savedSectionCutsStore.ts`), nie slice `ViewerState`
 * (`store/index.ts` je na rozpočte veľkosti). Záložky žijú len počas relácie;
 * trvalý je uložený pohľad hosta (D-122). Logika je v `viewTabsPlan.ts`,
 * vykonanie v `viewTabsApply.ts` (lenivo).
 */

import { create } from 'zustand';
import { initialTabs, type ViewTabsState } from './viewTabsLayout.js';
import type { TilesState } from './viewTilesPlan.js';

interface ViewTabsStore extends ViewTabsState, TilesState {
  /** Záložka, ktorá je práve v 3D canvase (od D-161 vždy `3d`). */
  sceneId: string;
  /** Kartu otvoril most (`DOCUMENT_OPEN`): záložku nastaví `showDoc`, nie synchronizácia kariet. */
  bridgeDocId: string | null;
  /** Dlaždice (AIM D-157): štýl obalu 3D canvasu v živej dlaždici, null = celá plocha. */
  frame: Record<string, string> | null;
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

/**
 * Pohľad zhora na podlažie (`mode=2d`, AIM D-161): kameru a rez vykoná `useAimViewCommands`, tu je len
 * odkaz naň pre lenivé záložky (staršie správy `VIEW_TABS open` pre pôdorys). Najnovší podľa podlaží viewera.
 */
type TopView = (storeyGuid: string | undefined, note: (issue: string) => void) => Promise<void> | void;
let topViewImpl: TopView | null = null;
export const setTopView = (f: TopView | null) => { topViewImpl = f; };
export const runTopView: TopView = (guid, note) => topViewImpl?.(guid, note);

export const useAimViewTabs = create<ViewTabsStore>(() => ({
  ...initialTabs(), sceneId: '3d', bridgeDocId: null, layout: 'single', tiles: [], frame: null, shots: 0,
}));
