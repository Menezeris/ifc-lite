/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lišta záložiek nad strednou plochou (AIM D-132, #165): 3D, pôdorysy podlaží,
 * uložené pohľady z chatu a otvorené dokumenty. Aktívna záložka má celú plochu;
 * "Vedľa" dá k nej druhú (dokument, alebo pôdorys ako 2D plán vedľa 3D). Lenivo
 * z `ViewerLayout.tsx`; na mobile sa neukazuje (dokument tam je prekrytie D-075).
 * Pod lištou sa pri pokuse o orbit v zamknutom pôdoryse ukáže ponuka prepnúť do 3D
 * (`AimPlanOrbitHint`, #188). Lišta tiež dodá záložkám funkcie viewera (`TabDeps`) z hookov pôdorysu.
 * Prepínač "Rozloženie" rozdelí plochu na 2 až 4 dlaždice (D-157); "Vedľa" pre dvojicu,
 * ktorú plocha bez dlaždíc nevie (dve 3D, dva dokumenty), prepne na dve dlaždice vedľa seba.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Box, FileText, LayoutTemplate, Scan, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewerStore } from '@/store';
import { useViewMode } from '@/hooks/useViewMode';
import { useFloorplanView } from '@/hooks/useFloorplanView';
import type { ViewTabKind } from './viewTabsPlan.js';
import { useAimViewTabs } from './viewTabsStore.js';
import { activate, beside, close, openPlan, setLayout, syncDocs } from './viewTabsApply.js';
import { TILE_LAYOUTS, TILE_LAYOUT_LABELS, isTileLayout } from './viewTilesPlan.js';
import { AimPlanOrbitHint } from './AimPlanOrbitHint.js';

const ICON: Record<ViewTabKind, typeof Box> = { '3d': Box, plan: LayoutTemplate, view: Scan, doc: FileText };
const SELECT = 'h-6 max-w-40 rounded border bg-background px-1 text-2xs text-muted-foreground';
const warn = (issue: string) => console.warn('[aim-tabs]', issue);

export function AimViewTabsBar() {
  const isMobile = useViewerStore((s) => s.isMobile);
  const { storeys, storeyHasDrawing } = useViewMode();
  const { enterDrawingView, enterSplitView, exitSplitView } = useFloorplanView();
  useEffect(() => {
    useAimViewTabs.setState({ deps: { storeys, storeyHasDrawing, enterDrawingView, enterSplitView, exitSplitView } });
  }, [storeys, storeyHasDrawing, enterDrawingView, enterSplitView, exitSplitView]);
  useEffect(() => () => useAimViewTabs.setState({ deps: null }), []);

  // Karty dokumentov D-075 -> záložky (nová aktívna karta = aktívna záložka).
  const docTabs = useViewerStore((s) => s.docTabs);
  const docs = useViewerStore((s) => s.viewerDocuments);
  const activeDocTabId = useViewerStore((s) => s.activeDocTabId);
  const prevSyncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isMobile) return;
    const opened = activeDocTabId && activeDocTabId !== prevSyncedRef.current ? activeDocTabId : null;
    prevSyncedRef.current = activeDocTabId;
    syncDocs(docTabs.map((t) => ({ docId: t.docId, label: docs.get(t.docId)?.name ?? t.docId })), opened);
  }, [docTabs, docs, activeDocTabId, isMobile]);

  const tabs = useAimViewTabs((s) => s.tabs);
  const activeId = useAimViewTabs((s) => s.activeId);
  const besideId = useAimViewTabs((s) => s.besideId);
  const layout = useAimViewTabs((s) => s.layout);
  // Vedľa ide každá dvojica: čo nevie plocha bez dlaždíc, rieši rozloženie dvoch dlaždíc (D-157).
  const pairable = useMemo(() => tabs.filter((t) => t.id !== activeId), [tabs, activeId]);
  if (isMobile) return null;

  return (
    <div className="relative flex h-7 shrink-0 items-stretch border-b bg-muted/30" data-testid="aim-view-tabs">
      <AimPlanOrbitHint />
      <div role="tablist" aria-label="Záložky pohľadov" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = ICON[tab.kind];
          const isActive = tab.id === activeId;
          const isBeside = tab.id === besideId;
          return (
            <div
              key={tab.id}
              className={cn(
                'flex max-w-48 shrink-0 items-center border-r',
                isActive ? 'bg-background' : isBeside ? 'bg-background/70' : 'hover:bg-muted/70',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                title={isBeside ? `${tab.label} (vedľa)` : tab.label}
                onClick={() => activate(tab.id, warn)}
                onAuxClick={(e) => { if (e.button === 1 && tab.kind !== '3d') close(tab.id, warn); }}
                className={cn(
                  'flex min-h-6 min-w-0 items-center gap-1 py-1 pl-2 pr-1 text-2xs',
                  isActive ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{tab.label}</span>
                {isBeside && <span className="text-2xs text-muted-foreground">vedľa</span>}
              </button>
              {tab.kind !== '3d' && (
                <button
                  type="button"
                  aria-label={`Zavrieť ${tab.label}`}
                  onClick={() => close(tab.id, warn)}
                  className="mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-1 px-1">
        <select
          aria-label="Otvoriť pôdorys"
          className={SELECT}
          value=""
          disabled={storeys.length === 0}
          onChange={(e) => { if (e.target.value) void openPlan(e.target.value, {}, warn); }}
        >
          <option value="">+ Pôdorys</option>
          {storeys.map((s) => <option key={s.key} value={s.guid}>{s.name}</option>)}
        </select>
        {layout === 'single' && (
          <select
            aria-label="Vedľa aktívnej záložky"
            className={SELECT}
            value={besideId ?? ''}
            disabled={pairable.length === 0 && besideId === null}
            onChange={(e) => { void beside(e.target.value || null, warn); }}
          >
            <option value="">Vedľa: nič</option>
            {pairable.map((t) => <option key={t.id} value={t.id}>{`Vedľa: ${t.label}`}</option>)}
          </select>
        )}
        <select
          aria-label="Rozloženie dlaždíc"
          className={SELECT}
          value={layout}
          onChange={(e) => { if (isTileLayout(e.target.value)) void setLayout(e.target.value, [], warn); }}
        >
          {TILE_LAYOUTS.map((l) => <option key={l} value={l}>{`Rozloženie: ${TILE_LAYOUT_LABELS[l]}`}</option>)}
        </select>
      </div>
    </div>
  );
}
