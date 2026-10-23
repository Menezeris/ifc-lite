/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lišta záložiek nad strednou plochou (AIM D-132, #165): 3D a otvorené dokumenty
 * (od D-161 bez pôdorysov a uložených pohľadov, tie sú v Presentation). Aktívna
 * záložka má celú plochu; "Vedľa" dá k nej dokument. Lenivo z `ViewerLayout.tsx`;
 * na mobile sa neukazuje (dokument tam je prekrytie D-075).
 * Prepínač "Rozloženie" rozdelí plochu na 2 až 4 dlaždice (D-157); "Vedľa" pre dvojicu,
 * ktorú plocha bez dlaždíc nevie (dve 3D, dva dokumenty), prepne na dve dlaždice vedľa seba.
 */

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, ChevronDown, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewerStore } from '@/store';
import type { ViewTabKind } from './viewTabsPlan.js';
import { useAimViewTabs } from './viewTabsStore.js';
import { activate, beside, close, setLayout, syncDocs, syncViews } from './viewTabsApply.js';
import { TILE_LAYOUTS, TILE_LAYOUT_LABELS, isTileLayout } from './viewTilesPlan.js';
import { fitTabs } from './viewTabsFit.js';

const AimTileGrid = lazy(() => import('./AimTileGrid.js').then((m) => ({ default: m.AimTileGrid })));

const ICON: Record<ViewTabKind, typeof Box> = { '3d': Box, doc: FileText, view: Box };
const SELECT = 'h-6 max-w-40 rounded border bg-background px-1 text-2xs text-muted-foreground';
/** Miesto jednej záložky a tlačidla zoznamu pri preteku (px), #240. */
const SLOT_PX = 128;
const MORE_PX = 40;
const warn = (issue: string) => console.warn('[aim-tabs]', issue);

export function AimViewTabsBar() {
  const isMobile = useViewerStore((s) => s.isMobile);

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

  // Pohľady z Presentation (D-161) -> záložky v dlaždiciach: premenovanie a zmazanie.
  const basketViews = useViewerStore((s) => s.basketViews);
  useEffect(() => {
    if (!isMobile) syncViews(basketViews.map((v) => ({ id: v.id, name: v.name })));
  }, [basketViews, isMobile]);

  const allTabs = useAimViewTabs((s) => s.tabs);
  // Záložky pohľadov žijú len v dlaždiciach (hlavička dlaždice), v lište ich nie je.
  const tabs = useMemo(() => allTabs.filter((t) => t.kind !== 'view'), [allTabs]);
  const activeId = useAimViewTabs((s) => s.activeId);
  const besideId = useAimViewTabs((s) => s.besideId);
  const layout = useAimViewTabs((s) => s.layout);
  // Dlaždice (D-157) kreslí lenivá mriežka v obale 3D panela, nie vstupný `ViewerLayout`.
  const [tilesHost, setTilesHost] = useState<HTMLElement | null>(null);
  useEffect(() => setTilesHost(document.querySelector<HTMLElement>('[data-aim-tiles]')), []);
  // Vedľa ide každá dvojica: čo nevie plocha bez dlaždíc, rieši rozloženie dvoch dlaždíc (D-157).
  const pairable = useMemo(() => tabs.filter((t) => t.id !== activeId), [tabs, activeId]);
  // Pretek (#240): namiesto posuvníka zoznam ostatných záložiek na konci lišty.
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaWidth, setAreaWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setAreaWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => { if (!areaRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [moreOpen]);
  const fit = useMemo(
    () => fitTabs({
      ids: tabs.map((t) => t.id), activeId, besideId, slotWidth: SLOT_PX, moreWidth: MORE_PX,
      available: areaWidth ?? Number.POSITIVE_INFINITY,
    }),
    [tabs, activeId, besideId, areaWidth],
  );
  const visibleTabs = tabs.filter((t) => fit.visible.includes(t.id));
  const hiddenTabs = tabs.filter((t) => fit.hidden.includes(t.id));
  useEffect(() => { if (hiddenTabs.length === 0) setMoreOpen(false); }, [hiddenTabs.length]);
  if (isMobile) return null;

  return (
    <div className="relative flex h-7 shrink-0 items-stretch border-b bg-muted/30" data-testid="aim-view-tabs">
      {layout !== 'single' && tilesHost && createPortal(<Suspense fallback={null}><AimTileGrid /></Suspense>, tilesHost)}
      <div ref={areaRef} className="relative flex min-w-0 flex-1 items-stretch">
      <div role="tablist" aria-label="Záložky pohľadov" className="flex min-w-0 items-stretch overflow-hidden">
        {visibleTabs.map((tab) => {
          const Icon = ICON[tab.kind];
          const isActive = tab.id === activeId;
          const isBeside = tab.id === besideId;
          return (
            <div
              key={tab.id}
              className={cn(
                'flex w-32 shrink-0 items-center border-r',
                isActive ? 'bg-background' : isBeside ? 'bg-background/70' : 'hover:bg-muted/70',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                title={isBeside ? `${tab.label} (vedľa)` : tab.label}
                onClick={() => activate(tab.id)}
                onAuxClick={(e) => { if (e.button === 1 && tab.kind !== '3d') close(tab.id); }}
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
                  onClick={() => close(tab.id)}
                  className="mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {hiddenTabs.length > 0 && (
        <>
          <button
            type="button"
            aria-label={`Ďalšie záložky (${hiddenTabs.length})`}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            title={`Ďalšie záložky (${hiddenTabs.length})`}
            onClick={() => setMoreOpen((o) => !o)}
            className="flex min-h-6 shrink-0 items-center gap-0.5 border-r px-1.5 text-2xs text-muted-foreground hover:bg-muted/70"
            data-testid="aim-view-tabs-more"
          >
            <span>{`+${hiddenTabs.length}`}</span>
            <ChevronDown className="size-3" aria-hidden />
          </button>
          {moreOpen && (
            <div
              role="menu"
              aria-label="Ďalšie záložky"
              className="absolute right-0 top-full z-50 max-h-64 w-64 overflow-y-auto rounded-b border bg-background py-0.5 shadow-md"
            >
              {hiddenTabs.map((tab) => {
                const Icon = ICON[tab.kind];
                return (
                  <div key={tab.id} className="flex items-center hover:bg-muted/70">
                    <button
                      type="button"
                      role="menuitem"
                      title={tab.label}
                      onClick={() => { activate(tab.id); setMoreOpen(false); }}
                      className="flex min-h-6 min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left text-2xs"
                    >
                      <Icon className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{tab.label}</span>
                    </button>
                    {tab.kind !== '3d' && (
                      <button
                        type="button"
                        aria-label={`Zavrieť ${tab.label}`}
                        onClick={() => close(tab.id)}
                        className="mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      </div>
      <div className="flex shrink-0 items-center gap-1 px-1">
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
