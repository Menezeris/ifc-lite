/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `SET_PANELS` z chatu (AIM D-127, #179): otvorí, zavrie alebo prepne panely tými
 * istými akciami store ako lišta, rail a krížik panela (nič nové). Plán a opis
 * stavu sú v `aimPanelsPlan.ts`; tento modul sa načíta lenivo prvou správou.
 */

import { useViewerStore } from '../store/index.js';
import { closePanelWindow } from '../services/panel-windows.js';
import { PANEL_ID, panelInfo, planPanels, type PanelKey, type PanelsRequest } from './aimPanelsPlan.js';

type Store = ReturnType<typeof useViewerStore.getState>;

/** Vypne panel bez toho, aby otvoril iný stĺpec: plávajúce a samostatné okno zavrie, ukotvený skryje. */
function closePanel(s: Store, key: PanelKey): void {
  const id = PANEL_ID[key];
  if (key === 'model_tree') {
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
      // Vlastnosti sú záloha pravého stĺpca: zavrieť ich = zbaliť stĺpec, keď ho práve držia.
      if (s.sidebarActivePanel === 'properties' && s.sidebarMode !== 'collapsed') s.setSidebarMode('collapsed');
      return;
  }
}

function openPanel(s: Store, key: PanelKey): void {
  if (key === 'model_tree') s.setLeftPanelCollapsed(false);
  else s.showWorkspacePanel(PANEL_ID[key], 'programmatic');
}

/** Vykoná požiadavku; čo sa nepodarilo (napr. mobil s jedným panelom), zapíše ako problém pre `APPLIED`. */
export function applyPanels(req: PanelsRequest, noteIssue: (text: string) => void): void {
  const store = useViewerStore;
  const steps = planPanels(req, (key) => panelInfo(store.getState(), key).open);
  for (const step of steps) {
    if (step.open) openPanel(store.getState(), step.key);
    else closePanel(store.getState(), step.key);
  }
  const failed = steps.filter((step) => panelInfo(store.getState(), step.key).open !== step.open);
  if (failed.length > 0) {
    noteIssue(`SET_PANELS: ${failed.map((f) => `${f.key} ${f.open ? 'sa neotvoril' : 'sa nezavrel'}`).join(', ')}`);
  }
}
