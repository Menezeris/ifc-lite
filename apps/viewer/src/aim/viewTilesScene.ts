/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav 3D canvasu na dlaždicu (AIM D-161, krok Fork B): viewer má jeden canvas, preto sa pri
 * prepnutí živej 3D dlaždice stav odchádzajúcej (kamera, rez, košík) odloží a stav prichádzajúcej
 * sa obnoví. Dlaždica, ktorá ešte nebola živá, aktivuje svoj pohľad z Presentation ako klik na
 * jeho kartu. Odložený stav žije len počas relácie, trvalý je pohľad po uložení (D-161 bod 7).
 * Lenivo z `viewTabsApply.ts`; kameru, rez a košík volá cez store, nič nové nepočíta (D-098).
 */

import { useViewerStore } from '@/store';
import { captureSectionSnapshot } from '@/store/slices/pinboard-section-snapshot';
import type { BasketSectionSnapshot } from '@/store/slices/pinboardSlice';
import type { CameraViewpoint } from '@/store/types';
import { shoot } from './tileShots.js';

interface Stash {
  viewpoint: CameraViewpoint | null;
  section: BasketSectionSnapshot | null;
  entityRefs: string[];
}

const stashes = new Map<string, Stash>();

const capture = (): Stash => {
  const s = useViewerStore.getState();
  return { viewpoint: s.cameraCallbacks.getViewpoint?.() ?? null, section: captureSectionSnapshot(s), entityRefs: [...s.pinboardEntities] };
};

/** Zabudne odložený stav záložky (zmazaný pohľad, explicitná nová aktivácia); bez id všetky (späť na jedno okno). */
export const forgetStash = (tabId?: string) => void (tabId === undefined ? stashes.clear() : stashes.delete(tabId));

/** Odloží stav záložky, ktorú canvas opúšťa: snímka pre jej dlaždicu a kamera, rez a košík. */
export function leaveScene(tabId: string): void {
  shoot(tabId);
  stashes.set(tabId, capture());
}

/** Odložený stav späť do canvasu; zodpovedá aktivácii pohľadu (`basketViewActivator`), len z odloženého záznamu. */
function restore(st: Stash, viewId: string | null): void {
  const s = useViewerStore.getState();
  s.restoreBasketEntities(st.entityRefs, viewId ?? '');
  if (viewId === null) useViewerStore.setState({ activeBasketViewId: null });
  if (st.viewpoint) s.cameraCallbacks.applyViewpoint?.(st.viewpoint, false, 0);
  if (st.section) {
    s.installSectionPlanes(st.section.planes ?? [st.section.plane], st.section.activeIndex ?? 0);
    useViewerStore.setState({ sceneState: { ...s.sceneState, section: { visible: true } } });
    if (st.section.plane.enabled) s.setActiveTool('section', 'programmatic');
    else if (s.activeTool === 'section') s.setActiveTool('select', 'programmatic');
  } else {
    const cur = useViewerStore.getState();
    const off = <T extends { enabled: boolean; parked?: boolean }>(p: T): T => ({ ...p, enabled: false, parked: false });
    useViewerStore.setState({ sectionPlane: off(cur.sectionPlane), inactiveSectionPlanes: cur.inactiveSectionPlanes.map(off) });
    if (s.activeTool === 'section') s.setActiveTool('select', 'programmatic');
  }
}

/**
 * Pohľady, ktoré sme do canvasu poslali my (aktivácia, odložený stav): odber `activeBasketViewId` v mriežke ich
 * nesmie brať ako klik na kartu v Presentation a vymeniť dlaždicu. Záznam zaniká po spotrebovaní alebo po 3 s.
 */
const own = new Map<string, number>();
const OWN_MS = 3000;
const markOwn = (viewId: string) => void own.set(viewId, Date.now());
export function consumeOwn(viewId: string): boolean {
  const at = own.get(viewId);
  own.delete(viewId);
  return at !== undefined && Date.now() - at < OWN_MS;
}

type Activator = typeof import('@/store/basket/basketViewActivator');
let activator: Activator | null = null;
// Načíta sa spolu s týmto modulom, aby aktivácia pohľadu bežala synchrónne a v poradí s odložením stavu.
const activatorLoad = import('@/store/basket/basketViewActivator').then((m) => (activator = m));

/** Záložka sa stala živou: jej odložený stav, inak (pohľad) aktivácia pohľadu z Presentation. */
export function enterScene(tabId: string, viewId: string | undefined): Promise<void> | void {
  const st = stashes.get(tabId);
  if (viewId) markOwn(viewId);
  if (st) return restore(st, viewId ?? null);
  if (!viewId) return;
  if (activator) return activator.activateBasketViewFromStore(viewId);
  return activatorLoad.then((m) => m.activateBasketViewFromStore(viewId));
}
