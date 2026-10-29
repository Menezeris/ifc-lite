/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Excel hlasom" nad panelom Lists (AIM D-149): `view` v `OPEN_LIST` a správa
 * `LIST_UPDATE` upravia práve otvorený zoznam bez zakladania nového. Zoskupenie a
 * súčty idú do upstream `ListDefinition.grouping` (tá istá cesta ako hlavička
 * tabuľky, `handleGroupingFromTable`), nový filter spustí tabuľku znova cestou
 * D-148, zoradenie, hľadanie a maximalizáciu vykonajú háky v `ListResultsTable` a
 * `BottomStrip`. Stav zoznamu pre `view_state` a `APPLIED` opisuje `aimListState.ts`.
 * Krok 2: `edit` (stĺpce, triedy, odobratie filtrov, `aimListEditPlan.ts`) spustí zoznam
 * znova, farby podľa stĺpca a ponuku exportu vykoná hák tabuľky upstream cestami.
 */

import type { FilterGroup } from '@ifc-lite/rules';
import type { ListDefinition, ListGrouping } from '@ifc-lite/lists';
import { useViewerStore } from '@/store';
import { summariseListRows } from '@ifc-lite/lists';
import { carryListRun, listRunDefinition } from '@/lib/lists/run-provenance';
import type { LensInboundMessage } from './lens-protocol.js';
import { noteIssue } from './command-gate.js';
import { resolveModelRules } from './aimLensPlan.js';
import { chatListDefinition, noteListOpened, noteListUpdated } from './aimListRun.js';
import { andGroups, findColumn, nextGrouping, parseAddedGroups, parseListView, refLabel,
  type AimListColumnRef, type AimListView } from './aimListViewPlan.js';
import { editColumns, editTypes, hasEdit, parseListEdit, removeFilterKinds } from './aimListEditPlan.js';
import { pendingMaximize, pendingTableRequest, requestListTable, requestStripMaximize, setListHighlight, tableState, takeViewRequested } from './aimListViewStore.js';

type ListUpdateMessage = Extract<LensInboundMessage, { type: 'LIST_UPDATE' }>;

/**
 * Id stĺpcov zoznamu pre mená od hosta. Chýbajúci stĺpec je problém v `APPLIED` a táto
 * časť úpravy sa nevykoná (`undefined`), aby preklep nezmazal súčty ani zoskupenie.
 */
function columnIds(def: ListDefinition, refs: AimListColumnRef[] | undefined): string[] | undefined {
  if (!refs) return undefined;
  const ids: string[] = [];
  for (const ref of refs) {
    const col = findColumn(def.columns, ref);
    if (col) ids.push(col.id);
    else {
      noteIssue(`Zoznam: stĺpec ${refLabel(ref)} v zozname nie je (stĺpce: ${def.columns.map((c) => c.label ?? c.propertyName).join(', ')})`);
      return undefined;
    }
  }
  return ids;
}

/** Stĺpce, ktoré Lens farbiť nevie (upstream by ich ticho preložil na triedu IFC). */
const NO_COLOR = new Set(['spatial', 'zone', 'geometry']);

/** Id stĺpca na farby; stĺpec, ktorý Lens nevie, je problém v `APPLIED`. */
function colorColumnId(def: ListDefinition, ref: AimListColumnRef): string | undefined {
  const col = findColumn(def.columns, ref);
  if (col && NO_COLOR.has(col.source)) {
    noteIssue(`Zoznam: podľa stĺpca ${refLabel(ref)} (podlažie, priestor, zóna) Lens farbiť nevie; vyber stĺpec vlastnosti, atribútu, materiálu alebo modelu`);
    return undefined;
  }
  return columnIds(def, [ref])?.[0];
}

/** Zoskupenie a súčty z `view` do definície; ostatné (zoradenie, hľadanie, farby, export, maximalizácia) ako požiadavky hákom. */
export function applyListView(def: ListDefinition, view: AimListView): ListDefinition {
  let next = def;
  if (view.groupBy || view.sum) {
    const grouping = nextGrouping(def.grouping, columnIds(def, view.groupBy), columnIds(def, view.sum));
    next = { ...def, grouping };
  }
  let sort: { columnId: string; dir: 'asc' | 'desc' } | null | undefined;
  if (view.sort === null) sort = null;
  else if (view.sort) {
    const id = columnIds(def, [view.sort.column])?.[0];
    if (id) sort = { columnId: id, dir: view.sort.dir };
  }
  const colorBy = view.colorBy === null ? null : view.colorBy ? colorColumnId(def, view.colorBy) : undefined;
  if (sort !== undefined || view.search !== undefined || colorBy !== undefined || view.export || view.visibleOnly !== undefined || view.columnWidths) {
    requestListTable({ target: next.id, ...(sort !== undefined ? { sort } : {}), ...(view.search !== undefined ? { search: view.search } : {}),
      ...(colorBy !== undefined ? { colorBy } : {}), ...(view.export ? { export: view.export } : {}),
      ...(view.visibleOnly !== undefined ? { visibleOnly: view.visibleOnly } : {}), ...(view.columnWidths ? { columnWidths: view.columnWidths } : {}) });
  }
  if (view.highlight !== undefined) setListHighlight(view.highlight);
  if (view.maximize !== undefined) requestStripMaximize(view.maximize);
  return next;
}

function sameGrouping(a: ListGrouping | undefined, b: ListGrouping | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function updateListFromChat(msg: ListUpdateMessage): void {
  const view = parseListView((msg as { view?: unknown }).view);
  const added = parseAddedGroups((msg as { groups?: unknown }).groups);
  const edit = parseListEdit(msg.edit);
  if (!view || !added || !edit) {
    noteIssue('Zoznam: viewer úpravu odmietol (neplatné filtre alebo stĺpce)');
    return;
  }
  const s = useViewerStore.getState();
  const shown = s.listResult ? listRunDefinition(s.listResult) : null;
  const base = shown ?? chatListDefinition();
  if (!base) {
    noteIssue('Zoznam: nie je otvorený žiadny zoznam (najprv open_list)');
    return;
  }
  let def = base;
  let removed: string[] = [];
  const rerun = added.length > 0 || hasEdit(edit);
  if (rerun) {
    // Poradie: odobrať filtre, upraviť triedy, pridať filtre (podlažie a model nahradia staré).
    let groups: FilterGroup[] | string = removeFilterKinds(base.groups, edit.removeFilters ?? []);
    if (typeof groups !== 'string') groups = editTypes(groups, edit);
    let cols: ReturnType<typeof editColumns> = { columns: base.columns, grouping: base.grouping, removed: [] };
    if (typeof groups !== 'string' && added.length > 0) {
      const models = [...s.models.values()].map((m) => ({ name: m.name, fingerprint: m.sourceFingerprint }));
      groups = andGroups(groups, resolveModelRules(added, models))
        ?? 'filter sa nedá pridať k skupine OR so zoznamom; otvor zoznam znova cez open_list';
    }
    if (typeof groups !== 'string') cols = editColumns(base.columns, base.grouping, edit);
    if (typeof groups === 'string' || 'error' in cols) {
      noteIssue(`Zoznam: úpravu viewer nevykonal (${typeof groups === 'string' ? groups : 'error' in cols ? cols.error : ''})`);
      return;
    }
    // Nový beh má vlastné id: podľa neho `APPLIED` pozná, že výsledok je už ten upravený.
    def = { ...base, id: crypto.randomUUID(), groups, columns: cols.columns, grouping: cols.grouping, updatedAt: Date.now() };
    removed = cols.removed;
  }
  const prevTable = tableState();
  def = applyListView(def, view);
  s.setListPanelVisible(true);
  if (rerun || !shown) {
    // Nový beh prekreslí tabuľku: zoradenie a hľadanie, ktoré ukazovala, sa prenesú na nový výsledok
    // (zoradenie podľa odobratého stĺpca nie); farby a export z tejto správy ostanú v požiadavke.
    if (prevTable && shown && prevTable.listId === shown.id) {
      const req = pendingTableRequest();
      const kept = prevTable.sort && !removed.includes(prevTable.sort.columnId) ? prevTable.sort : null;
      requestListTable({ ...req, target: def.id, sort: req && req.sort !== undefined ? req.sort : kept, search: req?.search ?? prevTable.search });
    }
    // Nový filter alebo zoznam, ktorý ešte nebežal: spustí ho hák D-148.
    noteListOpened(def, true);
    s.setPendingListDraft(def);
    return;
  }
  if (!sameGrouping(def.grouping, base.grouping) && s.listResult) {
    // Ako `handleGroupingFromTable`: nové skupiny a súčty nad tými istými riadkami, uložený zoznam sa prepíše.
    const current = s.listResult;
    const summ = summariseListRows(def, current.rows);
    if (s.listDefinitions.some((d) => d.id === def.id)) s.updateListDefinition(def.id, { grouping: def.grouping });
    s.setListResult(carryListRun(current, { ...current, groups: summ.groups, summary: summ.summary }, def));
  }
  noteListUpdated(def);
}

const SETTLE_MS = 1500;
const REPORT_MS = 120;

/**
 * Počká, kým háky vykonajú požiadavky z chatu, ktoré sa vykonať dajú (tabuľka s
 * výsledkom toho zoznamu, pruh s panelom Lists), a ešte chvíľu na ich hlásenie.
 */
export async function settleListView(timeoutMs: number): Promise<void> {
  const until = Date.now() + Math.min(timeoutMs, SETTLE_MS);
  const waiting = () => {
    const s = useViewerStore.getState();
    const shownId = s.listResult ? listRunDefinition(s.listResult)?.id ?? null : null;
    const t = pendingTableRequest();
    const tableWaits = t !== null && shownId !== null && (t.target === null || t.target === shownId) && !s.listExecuting;
    return tableWaits || (pendingMaximize() !== null && s.listPanelVisible);
  };
  // Hák požiadavku vezme hneď, ale stav (napr. `isMaximized`) sa prekreslí až v ďalšom kroku React:
  // po každej požiadavke z tejto správy sa na hlásenie háku chvíľu počká.
  let touched = takeViewRequested();
  while (waiting() && Date.now() < until) {
    touched = true;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (touched) await new Promise((r) => setTimeout(r, REPORT_MS));
}
