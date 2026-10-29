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

import { Suspense, createElement, lazy, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { ColumnDefinition, ListResult, ListRow } from '@ifc-lite/lists';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { ExportFormat } from '@/lib/lists/export';
import type { DisplayItem } from '@/components/viewer/lists/list-table-utils';
import { listRunDefinition } from '@/lib/lists/run-provenance';
import { AUTO_COLOR_FROM_LIST_ID } from '@/lib/lens/persistence';
import { useViewerStore } from '@/store';
import { noteIssue } from './command-gate.js';
import { NO_HIGHLIGHT, cellKey, focusRowKeys, planColumnWidths, resolveHighlight, rowKey } from './aimListLayoutPlan.js';
import { listHighlight, pendingTableRequest, reportTable, subscribeListView, takeTableRequest } from './aimListViewStore.js';

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
  /** Filter "len viditeľné v 3D" (#276). */
  visibleOnly: boolean;
  setVisibleOnly: (on: boolean) => void;
  /** Šírky stĺpcov (#275): zobrazené a ručné prepísania tabuľky. */
  columnWidths: number[];
  setWidthOverrides: Dispatch<SetStateAction<Record<string, number>>>;
  sumColumnIds: string[];
  /** Zobrazené riadky tabuľky (prázdne v pivote) a jej virtualizér: prvý zvýraznený riadok sa raz posunie na obraz. */
  lines: readonly DisplayItem[];
  virtualizer: Pick<Virtualizer<HTMLDivElement, Element>, 'scrollToIndex'>;
}

/** Triedy zvýraznenia (#274) pre riadok, hlavičku a bunky stĺpca, bunku a bunku súčtu; prázdny reťazec = nezvýraznené. */
export interface AimHighlightClasses {
  row: (row: ListRow) => string;
  column: (columnId: string) => string;
  cell: (row: ListRow, columnId: string) => string;
  sum: (columnId: string) => string;
}

const ROW_HL = 'bg-amber-300/40 ring-1 ring-inset ring-amber-500/70';
const COLUMN_HL = 'bg-amber-300/30';
const CELL_HL = 'bg-amber-400/60 ring-1 ring-inset ring-amber-600';
const SUM_HL = 'bg-amber-400/60 ring-1 ring-inset ring-amber-600 text-foreground';
const NONE: AimHighlightClasses = { row: () => '', column: () => '', cell: () => '', sum: () => '' };

export function useAimListTable(b: AimListTableBinding): { cue: ReactNode; highlight: AimHighlightClasses } {
  const { result, sortCol, sortDir, search, visibleRows, sums, unitSymbol, setSortCol, setSortDir, setSearch,
    colorByColIdx, setColorByColIdx, onColorBy, onExport, visibleOnly, setVisibleOnly, columnWidths, setWidthOverrides,
    sumColumnIds, lines, virtualizer } = b;
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
    if (r.visibleOnly !== undefined) setVisibleOnly(r.visibleOnly);
    if (r.columnWidths) {
      const plan = planColumnWidths(r.columnWidths, result.columns, result.rows);
      if (plan.missing.length > 0) noteIssue(`Zoznam: šírku nastaviť nešlo, stĺpec ${plan.missing.join(', ')} v zozname nie je`);
      setWidthOverrides((prev) => {
        const next = { ...prev, ...plan.set };
        for (const id of plan.reset) delete next[id];
        return next;
      });
    }
  }, [request, listId, result, setSortCol, setSortDir, setSearch, onColorBy, setColorByColIdx, setVisibleOnly, setWidthOverrides]);

  // Zvýraznenie (#274): drží sa v store, tu sa preloží na stĺpce a riadky výsledku, ktorý tabuľka ukazuje.
  const highlight = useSyncExternalStore(subscribeListView, listHighlight, listHighlight);
  const resolved = useMemo(() => (highlight ? resolveHighlight(highlight, result.columns, result.rows) : NO_HIGHLIGHT), [highlight, result]);
  useEffect(() => {
    if (!highlight) return;
    if (resolved.missing.length > 0) noteIssue(`Zoznam: zvýrazniť nešlo, stĺpec ${resolved.missing.join(', ')} v zozname nie je`);
    if (highlight.sum && sumColumnIds.length === 0) noteIssue('Zoznam: zvýraznenie súčtu nemá čo ukázať, zoznam nemá súčty (view.sum)');
  }, [highlight, resolved, sumColumnIds.length]);
  const classes = useMemo<AimHighlightClasses>(() => (!highlight ? NONE : {
    row: (row) => (resolved.rowKeys.has(rowKey(row)) ? ROW_HL : ''),
    column: (id) => (resolved.columnIds.has(id) ? COLUMN_HL : ''),
    cell: (row, id) => (resolved.cellKeys.has(cellKey(row, id)) ? CELL_HL : ''),
    sum: (id) => (resolved.sumAll || resolved.sumIds.has(id) ? SUM_HL : ''),
  }), [highlight, resolved]);
  // Prvý zvýraznený riadok sa raz posunie na obraz (v zoskupenej tabuľke len ak je jeho skupina rozbalená).
  const scrolled = useRef<unknown>(null);
  const firstLine = useMemo(() => {
    if (!highlight) return -1;
    const keys = focusRowKeys(resolved);
    return lines.findIndex((it) => it.kind === 'row' && keys.has(rowKey(it.row)));
  }, [highlight, resolved, lines]);
  useEffect(() => {
    if (!highlight || firstLine < 0 || scrolled.current === highlight) return;
    scrolled.current = highlight;
    virtualizer.scrollToIndex(firstLine, { align: 'center' });
  }, [highlight, firstLine, virtualizer]);

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
      visibleOnly,
      widths: result.columns.map((c, i) => ({ columnId: c.id, width: columnWidths[i] })),
      highlight: highlight ? {
        rows: resolved.rowKeys.size, cells: resolved.cellKeys.size, columnIds: [...resolved.columnIds],
        sum: resolved.sumAll ? sumColumnIds : [...resolved.sumIds],
      } : null,
    });
  }, [listId, result, sortCol, sortDir, search, visibleRows, sums, unitSymbol, colorColumn, exportReady, visibleOnly, columnWidths, highlight, resolved, sumColumnIds]);

  useEffect(() => () => reportTable(null), []);

  const cue = !exportReady ? null : createElement(Suspense, { fallback: null }, createElement(AimListExportCue, {
    format: exportReady,
    onExport: (format: ExportFormat) => {
      setExportReady(null);
      onExport(format);
    },
    onDismiss: () => setExportReady(null),
  }));
  return { cue, highlight: classes };
}
