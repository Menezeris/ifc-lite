/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Lists table under the AIM chat bridge (#274 highlight, #275 column widths, #276 isolation):
 * `open_list` / `LIST_UPDATE` `view` parts reach the real `ListResultsTable` through the store
 * (`aimListViewStore`) and its `useAimListTable` hook, and the rendered DOM and `view_state` show them.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, useState } from 'react';
import { ProjectUnits } from '@ifc-lite/parser';
import type { ListResult } from '@ifc-lite/lists';
import { installLayout } from '@/test/dom-layout.js';
import { advance, cleanup, render } from '@/test/render.js';
import { fixtureModel, fixtureModels } from '@/test/store-fixture.js';
import { useViewerStore, type FederatedModel } from '@/store';
import { invalidateVisibleBasketCache } from '@/store/basketVisibleSet';
import { openListFromChat } from '@/aim/aimList';
import { applyListView } from '@/aim/aimListControl';
import { parseListView } from '@/aim/aimListViewPlan';
import { layoutPlanLoading, pendingTableRequest, resetListView, takeTableRequest, tableState } from '@/aim/aimListViewStore';
import type { LensInboundMessage } from '@/aim/lens-protocol';
import { recordListRun } from '@/lib/lists/run-provenance';
import { captureAnalysisStamp } from '@/hooks/useAnalysisStaleness';
import { ListResultsTable } from '@/components/viewer/lists/ListResultsTable.js';

const result: ListResult = {
  columns: [
    { id: 'col-0', source: 'attribute', propertyName: 'Name' },
    { id: 'col-1', source: 'spatial', propertyName: 'Referenced', label: 'Priestor (referenced)' },
    { id: 'col-2', source: 'quantity', psetName: 'Qto_SlabBaseQuantities', propertyName: 'NetArea' },
  ],
  rows: [
    { entityId: 11, modelId: 'a', values: ['Doska A', 'Izba 1', 12.5] },
    { entityId: 12, modelId: 'a', values: ['Doska B', 'Izba 2', 7] },
    { entityId: 13, modelId: 'a', values: ['Doska s naozaj veľmi dlhým názvom, ktorý sa do predvolenej šírky nezmestí', 'Izba 1', 3] },
  ],
  totalCount: 3,
  executionTime: 1,
};
const modelUnits = new Map([['a', ProjectUnits.empty()]]);
// The width and highlight maths (`aimListLayoutPlan`) load lazily on the first request, so wait for that before the next React step.
const settled = async () => { await layoutPlanLoading(); await advance(5); };
const AREA = { source: 'quantity' as const, psetName: 'Qto_SlabBaseQuantities', propertyName: 'NetArea' };
const NAME = { source: 'attribute' as const, propertyName: 'Name' };
const sumGrouping = { columnId: '', columnIds: [], sumColumnIds: ['col-2'], view: 'nested' as const };

function modelWithMeshes(): FederatedModel {
  const base = fixtureModel('a', { idOffset: 0 });
  return { ...base, maxExpressId: 100, geometryResult: { meshes: [11, 12, 13].map((expressId) => ({ expressId, ifcType: 'IfcSlab' })) } } as unknown as FederatedModel;
}

let restoreLayout: () => void;
let initialState: ReturnType<typeof useViewerStore.getState>;

beforeEach(() => {
  initialState = useViewerStore.getState();
  restoreLayout = installLayout();
  invalidateVisibleBasketCache();
  useViewerStore.setState(fixtureModels(modelWithMeshes()));
});
afterEach(() => {
  cleanup();
  restoreLayout();
  resetListView();
  useViewerStore.setState(initialState, true);
});

/** The table shows the result of the list `listId` (as after a run), so requests aimed at that list reach it. */
const mount = async (grouping?: typeof sumGrouping, listId = 'x') => {
  const shown = recordListRun({ ...result }, { id: listId, name: 'L', createdAt: 0, updatedAt: 0, entityTypes: [], groups: [], columns: result.columns }, captureAnalysisStamp());
  const ui = render(<ListResultsTable result={shown} grouping={grouping} onGroupingChange={() => {}} modelUnits={modelUnits} />);
  await settled();
  return ui;
};
const bodyRows = (ui: HTMLElement) => [...ui.querySelectorAll<HTMLButtonElement>('button.absolute[aria-pressed]')];
const view = (raw: unknown) => parseListView(raw) ?? assert.fail('view must parse');
const headerWidth = (ui: HTMLElement, name: string) => {
  const cell = [...ui.querySelectorAll<HTMLElement>('div.group\\/col')].find((c) => c.textContent?.includes(name));
  assert.ok(cell, `header ${name}`);
  return parseFloat(cell.style.width);
};

describe('#276 open_list pod izoláciou v 3D', () => {
  const msg = (extra: Record<string, unknown> = {}) => ({
    source: 'aim-bridge', type: 'OPEN_LIST', name: 'Dosky', groups: [{ combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcSlab'] }] }],
    columns: [{ source: 'attribute', propertyName: 'Name' }], ...extra,
  }) as unknown as LensInboundMessage;

  it('izolácia iných prvkov nezúži nový zoznam na 0 riadkov: filter "len viditeľné" sa vypne', async () => {
    useViewerStore.setState({ isolatedEntities: new Set([999]) });
    openListFromChat(msg());
    assert.equal(pendingTableRequest()?.visibleOnly, false);
    const ui = await mount(undefined, useViewerStore.getState().pendingListDraft!.id);
    assert.equal(bodyRows(ui).length, 3, 'all three rows are shown although 3D isolates something else');
    assert.equal(tableState()?.visibleOnly, false);
    assert.equal(useViewerStore.getState().isolatedEntities?.size, 1, 'the 3D isolation itself is left alone');
  });

  it('bez izolácie ostane filter zapnutý; view.visibleOnly ho prebije oboma smermi', async () => {
    openListFromChat(msg());
    assert.equal(pendingTableRequest()?.visibleOnly, undefined);
    takeTableRequest();
    useViewerStore.setState({ isolatedEntities: new Set([999]) });
    openListFromChat(msg({ view: { visibleOnly: true } }));
    assert.equal(pendingTableRequest()?.visibleOnly, true);
    const ui = await mount(undefined, useViewerStore.getState().pendingListDraft!.id);
    assert.equal(bodyRows(ui).length, 0, 'asked for visible-only under an isolation: nothing is visible');
  });
});

describe('#275 šírky stĺpcov z chatu', () => {
  it('fit rozšíri stĺpec s dlhým obsahom, ručná šírka a auto sa vykonajú, view_state ich hlási', async () => {
    const ui = await mount();
    const before = headerWidth(ui, 'Name');
    applyListView({ id: 'x', name: 'x', createdAt: 0, updatedAt: 0, entityTypes: [], groups: [], columns: result.columns },
      view({ columnWidths: [{ column: NAME, width: 'fit' }, { column: AREA, width: 333 }] }));
    await settled();
    assert.ok(headerWidth(ui, 'Name') > before, 'fit widened the long column past the 460 px default cap');
    assert.equal(headerWidth(ui, 'NetArea'), 333);
    const widths = tableState()?.widths;
    assert.equal(widths?.find((w) => w.columnId === 'col-2')?.width, 333);

    applyListView({ id: 'x', name: 'x', createdAt: 0, updatedAt: 0, entityTypes: [], groups: [], columns: result.columns }, view({ columnWidths: 'auto' }));
    await settled();
    assert.equal(headerWidth(ui, 'Name'), before, 'auto drops the manual widths');
    assert.notEqual(headerWidth(ui, 'NetArea'), 333);
  });
});

describe('#275 šírky stĺpcov pri inom zozname', () => {
  it('ručná šírka z jedného zoznamu sa neprenesie na stĺpce rovnakého id v druhom', async () => {
    const run = (id: string) => recordListRun({ ...result }, { id, name: id, createdAt: 0, updatedAt: 0, entityTypes: [], groups: [], columns: result.columns }, captureAnalysisStamp());
    const second = run('druhy');
    let show: (r: ListResult) => void = () => {};
    const Host = () => {
      const [shown, setShown] = useState(() => run('prvy'));
      show = setShown;
      return <ListResultsTable result={shown} onGroupingChange={() => {}} modelUnits={modelUnits} />;
    };
    const ui = render(<Host />);
    await settled();
    applyListView({ id: 'prvy', name: 'prvy', createdAt: 0, updatedAt: 0, entityTypes: [], groups: [], columns: result.columns }, view({ columnWidths: [{ column: AREA, width: 333 }] }));
    await settled();
    assert.equal(headerWidth(ui, 'NetArea'), 333);
    act(() => show(second));
    await settled();
    assert.notEqual(headerWidth(ui, 'NetArea'), 333, 'nový zoznam začína s automatickými šírkami');
  });
});

describe('#274 zvýraznenie z chatu', () => {
  const def = { id: 'x', name: 'x', createdAt: 0, updatedAt: 0, entityTypes: [], groups: [], columns: result.columns };
  const marked = (el: Element) => el.className.includes('ring-amber');

  it('riadok, stĺpec, bunka a súčet dostanú zvýraznenie a zrušenie ho vráti', async () => {
    const ui = await mount(sumGrouping);
    applyListView(def, view({ highlight: {
      rows: { column: { source: 'spatial', propertyName: 'Referenced' }, values: ['izba 2'] },
      cells: [{ column: AREA, row: { column: NAME, value: 'Doska A' } }],
      sum: true,
    } }));
    await settled();
    const rows = bodyRows(ui);
    assert.deepEqual(rows.map(marked), [false, true, false], 'only the row whose space is Izba 2');
    const cells = [...rows[0].querySelectorAll('span')];
    assert.deepEqual(cells.map(marked), [false, false, true], 'the cell Doska A / NetArea');
    const footer = ui.querySelector('div.sticky.bottom-0')!;
    assert.ok([...footer.children].some(marked), 'the totals row is highlighted');
    assert.deepEqual(tableState()?.highlight, { rows: 1, cells: 1, columnIds: [], sum: ['col-2'] });

    applyListView(def, view({ highlight: null }));
    await settled();
    assert.ok(bodyRows(ui).every((r) => !marked(r) && [...r.querySelectorAll('span')].every((c) => !marked(c))));
    assert.equal(tableState()?.highlight, null);
  });

  it('zvýraznený stĺpec farbí hlavičku aj bunky; nový zoznam zvýraznenie zruší', async () => {
    const ui = await mount();
    applyListView(def, view({ highlight: { columns: [AREA] } }));
    await settled();
    const header = [...ui.querySelectorAll<HTMLElement>('div.group\\/col')].find((c) => c.textContent?.includes('NetArea'))!;
    assert.ok(header.className.includes('bg-amber-300/30'));
    assert.ok(bodyRows(ui).every((r) => r.querySelectorAll('span')[2].className.includes('bg-amber-300/30')));

    openListFromChat({ source: 'aim-bridge', type: 'OPEN_LIST', name: 'Ďalší', groups: [{ combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcSlab'] }] }],
      columns: [{ source: 'attribute', propertyName: 'Name' }] } as unknown as LensInboundMessage);
    await settled();
    assert.equal(tableState()?.highlight, null, 'a new list starts without the previous highlight');
  });
});
