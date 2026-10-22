/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hák v upstream `ListResultsTable` (AIM D-149): vykoná zoradenie a hľadanie z chatu
 * nad lokálnym stavom tabuľky a zapíše, čo tabuľka ukazuje (zoradenie, hľadanie,
 * počet viditeľných riadkov, súčty v jednotke tabuľky) pre `view_state`.
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { ListResult } from '@ifc-lite/lists';
import { listRunDefinition } from '@/lib/lists/run-provenance';
import { pendingTableRequest, reportTable, subscribeListView, takeTableRequest } from './aimListViewStore.js';

type Dir = 'asc' | 'desc';

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
}

export function useAimListTable(b: AimListTableBinding): void {
  const { result, sortCol, sortDir, search, visibleRows, sums, unitSymbol, setSortCol, setSortDir, setSearch } = b;
  const request = useSyncExternalStore(subscribeListView, pendingTableRequest, pendingTableRequest);
  const listId = listRunDefinition(result)?.id ?? null;

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
  }, [request, listId, result, setSortCol, setSortDir, setSearch]);

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
    });
  }, [listId, result, sortCol, sortDir, search, visibleRows, sums, unitSymbol]);

  useEffect(() => () => reportTable(null), []);
}
