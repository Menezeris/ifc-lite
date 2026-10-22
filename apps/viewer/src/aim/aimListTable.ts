/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hák v upstream `ListResultsTable` (AIM D-149): vykoná zoradenie, hľadanie, farby
 * podľa stĺpca (upstream "Color by", krok 2) a ponuku exportu z chatu nad lokálnym
 * stavom tabuľky a zapíše, čo tabuľka ukazuje (zoradenie, hľadanie, počet viditeľných
 * riadkov, súčty v jednotke tabuľky, farby, ponúknutý export) pre `view_state`.
 * Vráti zvýraznené tlačidlo exportu (alebo null) pre lištu akcií tabuľky.
 */

import { Suspense, createElement, lazy, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ColumnDefinition, ListResult } from '@ifc-lite/lists';
import type { ExportFormat } from '@/lib/lists/export';
import { listRunDefinition } from '@/lib/lists/run-provenance';
import { AUTO_COLOR_FROM_LIST_ID } from '@/lib/lens/persistence';
import { useViewerStore } from '@/store';
import { pendingTableRequest, reportTable, subscribeListView, takeTableRequest } from './aimListViewStore.js';

type Dir = 'asc' | 'desc';

/** Tlačidlo exportu z chatu sa načíta až pri prvej ponuke, vstupný balík nerastie. */
const AimListExportCue = lazy(() => import('./AimListExportCue').then((m) => ({ default: m.AimListExportCue })));

export interface AimListTableBinding {
  result: ListResult;
  sortCol: number | null;
  sortDir: Dir;
  search: string;
  visibleRows: number;
  sums: Record<string, number>;
  unitSymbol: (colIndex: number) => string | null;
  setSortCol: (col: number | null) => void;
  setSortDir: (dir: Dir) => void;
  setSearch: (query: string) => void;
  /** Stĺpec upstream "Color by" (index) a jeho akcie z tabuľky. */
  colorByColIdx: number | null;
  setColorByColIdx: (col: number | null) => void;
  onColorBy: (col: ColumnDefinition, colIdx: number) => void;
  onExport: (format: ExportFormat) => void;
}

export function useAimListTable(b: AimListTableBinding): ReactNode {
  const { result, sortCol, sortDir, search, visibleRows, sums, unitSymbol, setSortCol, setSortDir, setSearch,
    colorByColIdx, setColorByColIdx, onColorBy, onExport } = b;
  const request = useSyncExternalStore(subscribeListView, pendingTableRequest, pendingTableRequest);
  const listId = listRunDefinition(result)?.id ?? null;
  const colorActive = useViewerStore((s) => s.activeLensId === AUTO_COLOR_FROM_LIST_ID);
  const [exportReady, setExportReady] = useState<ExportFormat | null>(null);

  useEffect(() => {
    if (!request || (request.target !== null && request.target !== listId)) return;
    const r = takeTableRequest();
    if (!r) return;
    if (r.sort === null) setSortCol(null);
    else if (r.sort) {
      const { columnId, dir } = r.sort;
      const idx = result.columns.findIndex((c) => c.id === columnId);
      if (idx >= 0) {
        setSortCol(idx);
        setSortDir(dir);
      }
    }
    if (r.search !== undefined) setSearch(r.search);
    if (r.colorBy) {
      const idx = result.columns.findIndex((c) => c.id === r.colorBy);
      if (idx >= 0) onColorBy(result.columns[idx], idx);
    } else if (r.colorBy === null) {
      // Zrušiť len farby z tabuľky; Lens z chatu ("AIM chat") v tom istom slote nechať.
      const s = useViewerStore.getState();
      const lens = s.savedLenses.find((l) => l.id === AUTO_COLOR_FROM_LIST_ID);
      if (s.activeLensId === AUTO_COLOR_FROM_LIST_ID && lens?.name.startsWith('Color by ')) s.setActiveLens(null);
      setColorByColIdx(null);
    }
    if (r.export) setExportReady(r.export);
  }, [request, listId, result, setSortCol, setSortDir, setSearch, onColorBy, setColorByColIdx]);

  const colorColumn = colorActive && colorByColIdx !== null ? result.columns[colorByColIdx] : undefined;
  useEffect(() => {
    const column = sortCol === null ? undefined : result.columns[sortCol];
    reportTable({
      listId,
      sort: column ? { columnId: column.id, dir: sortDir } : null,
      search,
      visibleRows,
      sums: Object.entries(sums).map(([columnId, value]) => {
        const unit = unitSymbol(result.columns.findIndex((c) => c.id === columnId));
        return { columnId, value, ...(unit ? { unit } : {}) };
      }),
      colorBy: colorColumn?.id ?? null,
      exportReady,
    });
  }, [listId, result, sortCol, sortDir, search, visibleRows, sums, unitSymbol, colorColumn, exportReady]);

  useEffect(() => () => reportTable(null), []);

  if (!exportReady) return null;
  return createElement(Suspense, { fallback: null }, createElement(AimListExportCue, {
    format: exportReady,
    onExport: (format: ExportFormat) => {
      setExportReady(null);
      onExport(format);
    },
    onDismiss: () => setExportReady(null),
  }));
}
