/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav zoznamu v paneli Lists pre `view_state` a `APPLIED` (AIM D-149). Oddelený od
 * `aimListControl.ts`, aby dotazy stavu (`viewQueries.ts`) neťahali kód úprav zoznamu.
 */

import { useViewerStore } from '@/store';
import { listRunDefinition } from '@/lib/lists/run-provenance';
import { chatListDefinition } from './aimListRun.js';
import { describeListState } from './aimListViewPlan.js';
import { stripState, tableState } from './aimListViewStore.js';

/** Stav zoznamu v paneli Lists (aj zoznamu, ktorý zostavil používateľ); null = panel zavretý a bez výsledku. */
export function describeList(): Record<string, unknown> | null {
  const s = useViewerStore.getState();
  if (!s.listPanelVisible && !s.listResult) return null;
  const shown = s.listResult ? listRunDefinition(s.listResult) : null;
  const def = shown ?? chatListDefinition();
  if (!def) return { panel_open: s.listPanelVisible, has_result: false };
  const table = tableState();
  const strip = stripState();
  return describeListState(def, {
    panelOpen: s.listPanelVisible,
    executing: s.listExecuting,
    rows: shown && s.listResult ? s.listResult.totalCount : null,
    table: table && table.listId === def.id ? table : null,
    maximized: strip?.active === 'lists' && strip.maximized,
  });
}
