/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `SET_PANELS` z chatu (AIM D-127, D-150, #179): otvorí, zavrie alebo prepne ľubovoľný
 * panel UI tými istými akciami store ako lišta, rail a krížik panela (nič nové). Plán a opis
 * stavu sú v `aimPanelsPlan.ts`; tento modul sa načíta lenivo prvou správou.
 */

import { useViewerStore } from '../store/index.js';
import { closePanelWindow } from '../services/panel-windows.js';
import { SIDEBAR_PANEL_FLAGS } from '../store/store-sync.js';
import { BOTTOM_PANEL_SETTER, isBottomPanel } from '../lib/panels/bottom-panels.js';
import { panelIdOf } from './aimPanelList.js';
import { panelInfo, planPanels, validPanelNames, type PanelKey, type PanelsRequest } from './aimPanelsPlan.js';
import { forgetPanelZoom } from './aimPanelScroll.js';

type Store = ReturnType<typeof useViewerStore.getState>;

/** Vypne panel bez toho, aby otvoril iný stĺpec: plávajúce a samostatné okno zavrie, ukotvený skryje. */
function closePanel(s: Store, key: PanelKey): void {
  const id = panelIdOf(key);
  forgetPanelZoom(key);
  if (id === 'hierarchy') {
    s.setLeftPanelCollapsed(true);
    return;
  }
  s.closeFloatingPanel(id);
  if (s.poppedOutIds.includes(id)) closePanelWindow(id);
  switch (key) {
    case 'lens':
      // Veľká legenda (AIM D-119) je plávajúci Lens: zavretím zmizne aj jej príznak.
      delete document.documentElement.dataset.aimBigLegend;
      s.setLensPanelVisible(false);
      return;
    case 'underlays':
      s.setUnderlayPanelVisible(false);
      return;
    case 'documents':
      s.setDocumentsPanelVisible(false);
      return;
    case 'lists':
      s.setListPanelVisible(false);
      return;
    case 'properties':
      // Vlastnosti sú záloha pravého stĺpca: v spodnej polovici splitu ju uvoľnia, v hornej zbalia stĺpec.
      if (s.sidebarSecondaryPanel === 'properties') s.setSidebarSecondaryPanel(null);
      else if (s.sidebarActivePanel === 'properties' && s.sidebarMode !== 'collapsed') s.setSidebarMode('collapsed');
      return;
    default:
      closeGenericPanel(s, id);
  }
}

/**
 * Ostatné panely registra (D-150): spodný pás vypne svojím príznakom, dolná polovica splitu sa uvoľní,
 * panel s príznakom v pravom stĺpci ho vypne (stĺpec sa sám vráti na ďalší alebo na vlastnosti) a panel
 * bez príznaka (zones, cost...) vráti stĺpec na vlastnosti, ako ho zatvára krížik.
 */
function closeGenericPanel(s: Store, id: ReturnType<typeof panelIdOf>): void {
  if (isBottomPanel(id)) {
    s[BOTTOM_PANEL_SETTER[id]](false);
    return;
  }
  if (s.sidebarSecondaryPanel === id) {
    s.setSidebarSecondaryPanel(null);
    return;
  }
  const flag = SIDEBAR_PANEL_FLAGS.find(([, panel]) => panel === id)?.[0];
  if (flag) useViewerStore.setState({ [flag]: false });
  else if (s.sidebarActivePanel === id) s.setSidebarActivePanel('properties');
}

function openPanel(s: Store, key: PanelKey): void {
  const id = panelIdOf(key);
  if (id === 'hierarchy') s.setLeftPanelCollapsed(false);
  else s.showWorkspacePanel(id, 'programmatic');
}

/** Vykoná požiadavku; čo sa nepodarilo (napr. mobil s jedným panelom), zapíše ako problém pre `APPLIED`. */
export function applyPanels(req: PanelsRequest, noteIssue: (text: string) => void): void {
  const store = useViewerStore;
  const { steps, unknown } = planPanels(req, (key) => panelInfo(store.getState(), key).open);
  if (unknown.length > 0) noteIssue(`SET_PANELS: neznámy panel ${unknown.join(', ')} (platné: ${validPanelNames()})`);
  for (const step of steps) {
    if (step.open) openPanel(store.getState(), step.key);
    else closePanel(store.getState(), step.key);
  }
  const failed = steps.filter((step) => panelInfo(store.getState(), step.key).open !== step.open);
  if (failed.length > 0) {
    noteIssue(`SET_PANELS: ${failed.map((f) => `${f.key} ${f.open ? 'sa neotvoril' : 'sa nezavrel'}`).join(', ')}`);
  }
}
