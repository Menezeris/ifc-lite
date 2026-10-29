/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dlaždice záložiek (AIM D-157, #210): vrstva nad 3D panelom, lenivo z lišty
 * záložiek cez portál do obalu 3D panela (`data-aim-tiles` v `ViewerLayout.tsx`). Každá dlaždica má hlavičku s výberom záložky. Živá 3D
 * dlaždica je priehľadná: pod ňou je jediný 3D canvas, ktorý `useAimCenterPanes`
 * posunie do jej obdĺžnika (canvas sa nikdy neremountuje). Ostatné 3D dlaždice
 * ukazujú snímku (`tileShots.ts`) a klik ich urobí živými; dokument je živý vždy.
 */

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { capturePointer } from '@/lib/pointer-capture';
import { useViewerStore } from '@/store';
import { PdfDocumentView } from '@/components/documents/PdfDocumentView';
import { ImageDocumentView } from '@/components/documents/ImageDocumentView';
import { isSceneTab, type ViewTab } from './viewTabsLayout.js';
import { useAimViewTabs } from './viewTabsStore.js';
import { TILE_HEADER_PX, liveTile, sizesFromDrag, tileDividers, tileRects, type TileDivider, type TileLayout, type TileRect } from './viewTilesPlan.js';
import { activate, putTile, resizeTiles, showViewLive } from './viewTabsApply.js';
import { viewTabId } from './viewTabsPlan.js';
import { shotOf } from './tileShots.js';
import { consumeOwn } from './viewTilesScene.js';
import { AimPlanPositionToggle } from './AimPlanPositionToggle.js';

const pct = (v: number) => `${Math.round(v * 1e4) / 100}%`;
const place = (r: TileRect) => ({ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) });

export function AimTileGrid() {
  const layout = useAimViewTabs((s) => s.layout);
  const tiles = useAimViewTabs((s) => s.tiles);
  const sizes = useAimViewTabs((s) => s.sizes);
  const tabs = useAimViewTabs((s) => s.tabs);
  const activeId = useAimViewTabs((s) => s.activeId);
  const sceneId = useAimViewTabs((s) => s.sceneId);
  // D-161: pohľad, ktorý používateľ zapol kartou v Presentation, ide do živej dlaždice (canvas ho už ukazuje).
  const activeView = useViewerStore((s) => s.activeBasketViewId);
  const seenView = useRef(activeView);
  useEffect(() => {
    if (seenView.current === activeView) return;
    seenView.current = activeView;
    if (activeView && layout !== 'single' && !consumeOwn(activeView)) showViewLive(activeView, { applied: true });
  }, [activeView, layout]);
  if (layout === 'single') return null;
  const rects = tileRects(layout, sizes);
  const live = liveTile({ layout, tiles }, sceneId);

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="aim-tile-grid">
      {rects.map((rect, i) => {
        const id = tiles[i] ?? null;
        const tab = id ? tabs.find((t) => t.id === id) : undefined;
        const isLive = i === live;
        return (
          <section
            key={i}
            aria-label={`Dlaždica ${i + 1}${tab ? `: ${tab.label}` : ''}`}
            className={cn('absolute flex flex-col border', id === activeId ? 'border-primary' : 'border-border')}
            style={place(rect)}
          >
            <TileHeader index={i} tab={tab} tabs={tabs} live={isLive} />
            <div className={cn('min-h-0 flex-1', !isLive && 'pointer-events-auto bg-background')}>
              {!tab ? (
                <p className="flex h-full items-center justify-center text-xs text-muted-foreground">Vyber záložku v hlavičke dlaždice</p>
              ) : tab.kind === 'doc' ? (
                <DocTile tab={tab} />
              ) : isLive ? null : (
                <ShotTile tab={tab} />
              )}
            </div>
          </section>
        );
      })}
      {tileDividers(layout, sizes).map((d) => <DividerHandle key={d.index} layout={layout} divider={d} />)}
    </div>
  );
}

/** Deliaca čiara dlaždíc (AIM #299): ťahom myšou sa menia podiely, dvojklik vráti delenie na polovice. */
function DividerHandle({ layout, divider }: { layout: TileLayout; divider: TileDivider }) {
  const vertical = divider.axis === 'x';
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const grid = e.currentTarget.parentElement;
    if (!grid) return;
    e.preventDefault();
    const box = grid.getBoundingClientRect();
    const handle = e.currentTarget;
    capturePointer(handle, e.pointerId);
    const move = (ev: PointerEvent) => {
      const pos = vertical ? (ev.clientX - box.left) / box.width : (ev.clientY - box.top) / box.height;
      const next = sizesFromDrag(layout, useAimViewTabs.getState().sizes, divider.index, pos);
      if (next) resizeTiles(next);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };
  // Šípky posunú čiaru o 5 % (klávesnicový ekvivalent ťahania).
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === (vertical ? 'ArrowLeft' : 'ArrowUp') ? -0.05 : e.key === (vertical ? 'ArrowRight' : 'ArrowDown') ? 0.05 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = sizesFromDrag(layout, useAimViewTabs.getState().sizes, divider.index, divider.pos + step);
    if (next) resizeTiles(next);
  };
  return (
    <div
      tabIndex={0}
      // The divider resizes the tiles; a decorative <hr> cannot be operated by keyboard (same as ChatResizeHandle).
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(divider.pos * 100)}
      aria-label="Zmeniť veľkosť dlaždíc"
      data-testid={`aim-tile-divider-${divider.index}`}
      className={cn('pointer-events-auto absolute z-20 hover:bg-primary/40', vertical ? 'top-0 h-full w-1.5 -translate-x-1/2 cursor-col-resize' : 'left-0 h-1.5 w-full -translate-y-1/2 cursor-row-resize')}
      style={vertical ? { left: pct(divider.pos) } : { top: pct(divider.pos) }}
      onPointerDown={onDown}
      onKeyDown={onKey}
      onDoubleClick={() => resizeTiles(null)}
    />
  );
}

function TileHeader({ index, tab, tabs, live }: { index: number; tab: ViewTab | undefined; tabs: readonly ViewTab[]; live: boolean }) {
  const views = useViewerStore((s) => s.basketViews);
  return (
    <div className="pointer-events-auto flex shrink-0 items-center gap-1 border-b bg-muted/60 px-1" style={{ height: TILE_HEADER_PX - 1 }}>
      <select
        aria-label={`Záložka v dlaždici ${index + 1}`}
        className="h-5 min-w-0 max-w-48 rounded border bg-background px-1 text-2xs"
        value={tab?.id ?? ''}
        onChange={(e) => putTile(index, e.target.value || null)}
      >
        <option value="">(prázdna)</option>
        {tabs.filter((t) => t.kind !== 'view').map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        {views.length > 0 && (
          <optgroup label="Pohľady">
            {views.map((v) => <option key={v.id} value={viewTabId(v.id)}>{v.name}</option>)}
          </optgroup>
        )}
      </select>
      {tab && isSceneTab(tab) && (
        <span className="truncate text-2xs text-muted-foreground">{live ? 'živé 3D' : 'snímka'}</span>
      )}
      {tab?.docId && <AimPlanPositionToggle docId={tab.docId} />}
    </div>
  );
}

function DocTile({ tab }: { tab: ViewTab }) {
  const doc = useViewerStore((s) => (tab.docId ? s.viewerDocuments.get(tab.docId) : undefined));
  if (!doc) return <p className="p-2 text-xs text-muted-foreground">Dokument sa načítava...</p>;
  return (
    <div className="h-full" onPointerDownCapture={() => { if (useAimViewTabs.getState().activeId !== tab.id) activate(tab.id); }}>
      {doc.kind === 'image'
        ? <ImageDocumentView key={doc.id} url={doc.url} name={doc.name} />
        : <PdfDocumentView key={doc.id} docId={doc.id} url={doc.url} />}
    </div>
  );
}

/** 3D dlaždica mimo canvasu: posledný obraz záložky, klik ju urobí živou. */
function ShotTile({ tab }: { tab: ViewTab }) {
  const version = useAimViewTabs((s) => s.shots);
  const ref = useRef<HTMLCanvasElement>(null);
  const shot = shotOf(tab.id);
  // Pohľad z Presentation, ktorý ešte nebol živý, ukáže náhľad z panela (D-161).
  const thumb = useViewerStore((s) => (tab.viewId ? s.basketViews.find((v) => v.id === tab.viewId)?.thumbnailDataUrl : null));
  useEffect(() => {
    const out = ref.current;
    const src = shotOf(tab.id);
    if (!out || !src) return;
    out.width = src.width;
    out.height = src.height;
    out.getContext('2d')?.drawImage(src, 0, 0);
  }, [tab.id, version]);
  return (
    <button
      type="button"
      onClick={() => activate(tab.id)}
      title="Klikni pre živý 3D pohľad"
      className="group relative flex h-full min-h-6 w-full items-center justify-center bg-background"
    >
      {shot ? (
        <canvas ref={ref} aria-hidden className="h-full w-full object-contain" />
      ) : thumb ? (
        <img src={thumb} alt={tab.label} className="h-full w-full object-contain" />
      ) : null}
      <span className="absolute bottom-1 rounded bg-background/80 px-1.5 py-0.5 text-2xs text-muted-foreground group-hover:text-foreground">
        {shot || thumb ? 'Klikni pre živý pohľad' : 'Bez snímky - klikni pre živý pohľad'}
      </span>
    </button>
  );
}
