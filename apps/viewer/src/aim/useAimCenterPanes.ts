/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stredná plocha viewera (AIM-FORK, `ViewerLayout.tsx`): 2D plán D-072, 3D
 * canvas a panel dokumentu D-075, od D-132 riadené záložkami. Presunuté sem z
 * AIM-FORK bloku `ViewerLayout.tsx` (súbor je na rozpočte veľkosti), správanie
 * panelov je to isté: všetky tri sú stále pripojené (WebGPU canvas sa nikdy
 * neremountuje) a len sa zbaľujú.
 *
 * D-132 (karty dokumentov sa do záložiek zosúlaďujú v lenivej lište `AimViewTabsBar`):
 * dokument sa ukáže len ako aktívna záložka (3D sa zbalí, dokument má
 * celú plochu) alebo vedľa 3D záložky ("Vedľa"); keď je aktívna 3D záložka,
 * otvorené dokumenty čakajú v lište.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { useViewerStore } from '@/store';
import { useFloorplanView } from '@/hooks/useFloorplanView';
import { centerLayout } from './viewTabsLayout.js';
import { useAimViewTabs } from './viewTabsStore.js';
import { useAimPlanRefit } from './useAimPlanRefit.js';

/** Šírka panela dokumentu pri prvom otvorení vedľa 3D, % strednej skupiny. */
const DOC_PANE_OPEN_PCT = '42%';

/** react-resizable-panels v4 berie percentá len ako reťazec; holé číslo sú pixely. */
function resizePanelPct(panel: PanelImperativeHandle, size: string): void {
  (panel.resize as unknown as (size: string) => void)(size);
}

export function useAimCenterPanes(isMobile: boolean) {
  // AIM #211: pôdorys v záložke sa po zmene veľkosti plochy (stĺpec vlastností) znova vyplní.
  useAimPlanRefit(isMobile);
  // D-072 split: panel plánu sa rozbalí a zbalí s `underlaySplitView`.
  const underlaySplitView = useViewerStore((s) => s.underlaySplitView);
  const planePanelRef = useRef<PanelImperativeHandle>(null);
  useEffect(() => {
    const panel = planePanelRef.current;
    if (!panel) return;
    if (underlaySplitView && panel.isCollapsed()) panel.expand();
    else if (!underlaySplitView && !panel.isCollapsed()) panel.collapse();
  }, [underlaySplitView]);

  // 3D sa zbalí pri 2D na celú plochu (D-075) alebo pri dokumente ako aktívnej záložke (D-132).
  const underlayPlanFull = useViewerStore((s) => s.underlayPlanFull);
  const tabs = useAimViewTabs((s) => s.tabs);
  const activeId = useAimViewTabs((s) => s.activeId);
  const besideId = useAimViewTabs((s) => s.besideId);
  // D-157: pri dlaždiciach je 3D panel na celú plochu, canvas sa posunie do živej dlaždice.
  const tiled = useAimViewTabs((s) => s.layout !== 'single') && !isMobile;
  const frame = useAimViewTabs((s) => s.frame);
  const tileFrame = tiled && frame ? frame : undefined;
  const layout = useMemo(() => centerLayout({ tabs, activeId, besideId }, tiled), [tabs, activeId, besideId, tiled]);
  const collapse3d = underlayPlanFull || (!isMobile && layout.collapse3d);
  const collapse3dRef = useRef(collapse3d);
  collapse3dRef.current = collapse3d;
  const viewport3dPanelRef = useRef<PanelImperativeHandle>(null);
  useEffect(() => {
    const panel = viewport3dPanelRef.current;
    if (!panel) return;
    if (collapse3d && !panel.isCollapsed()) panel.collapse();
    else if (!collapse3d && panel.isCollapsed()) panel.expand();
  }, [collapse3d]);
  // Ťahanie úchytky smie 3D zbaliť len vtedy, keď to chce rozloženie.
  const onViewport3dResize = useCallback(() => {
    const panel = viewport3dPanelRef.current;
    if (panel?.isCollapsed() && !collapse3dRef.current) panel.expand();
  }, []);

  // Panel dokumentu: otvorené karty mimo 2D na celú plochu a (D-132) aktívna alebo vedľa.
  const docPaneOpen = useViewerStore((s) => s.docTabs.length > 0);
  const docPaneVisible = docPaneOpen && !underlayPlanFull && (isMobile || layout.docPane);
  const docPaneVisibleRef = useRef(docPaneVisible);
  docPaneVisibleRef.current = docPaneVisible;
  const docPanelRef = useRef<PanelImperativeHandle>(null);
  useEffect(() => {
    const panel = docPanelRef.current;
    if (!panel) return;
    if (docPaneVisible && panel.isCollapsed()) {
      panel.expand();
      // Panel začína na 0 a je posledný v skupine: prvé otvorenie by bolo len prúžok.
      if (panel.getSize().asPercentage < 20) resizePanelPct(panel, DOC_PANE_OPEN_PCT);
    } else if (!docPaneVisible && !panel.isCollapsed()) {
      panel.collapse();
    }
  }, [docPaneVisible]);
  // Ťahanie nesmie zbaliť viditeľný panel (opätovné otvorenie karty ho nerozbalí).
  const onDocPaneResize = useCallback(() => {
    const panel = docPanelRef.current;
    if (panel?.isCollapsed() && docPaneVisibleRef.current) {
      panel.expand();
      if (panel.getSize().asPercentage < 20) resizePanelPct(panel, DOC_PANE_OPEN_PCT);
    }
  }, []);

  // D-075: otvorená karta nesmie zostať neviditeľná. 2D na celú plochu ju skrýva,
  // preto ho zruší; na mobile prekrytie plánu zakryje dokument, preto split zavrie.
  const { exitSplitView } = useFloorplanView();
  const activeDocTabId = useViewerStore((s) => s.activeDocTabId);
  const prevActiveDocRef = useRef(activeDocTabId);
  useEffect(() => {
    const prev = prevActiveDocRef.current;
    prevActiveDocRef.current = activeDocTabId;
    if (!activeDocTabId || activeDocTabId === prev) return;
    const s = useViewerStore.getState();
    if (s.underlayPlanFull) s.setUnderlayPlanFull(false);
    if (isMobile && s.underlaySplitView) exitSplitView();
  }, [activeDocTabId, isMobile, exitSplitView]);

  return {
    underlaySplitView, underlayPlanFull, planePanelRef, viewport3dPanelRef, onViewport3dResize,
    docPaneOpen, docPaneVisible, docPanelRef, onDocPaneResize, tileFrame,
  };
}
