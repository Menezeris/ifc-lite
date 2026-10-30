/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { ColumnDefinition, ListRow } from '@ifc-lite/lists';
import { cellKey, cellEquals, fitColumnWidth, focusRowKeys, planColumnWidths, resolveHighlight, rowKey } from './aimListLayoutPlan.js';
import { describeListState, parseListView } from './aimListViewPlan.js';

const COLUMNS: ColumnDefinition[] = [
  { id: 'col-0', source: 'attribute', propertyName: 'Name' },
  { id: 'col-1', source: 'spatial', propertyName: 'Referenced', label: 'Priestor (referenced)' },
  { id: 'col-2', source: 'quantity', psetName: 'Qto_SlabBaseQuantities', propertyName: 'NetArea' },
];
const row = (entityId: number, ...values: ListRow['values']): ListRow => ({ entityId, modelId: 'm', values });
const ROWS = [row(1, 'Doska A', 'Izba 1', 12.5), row(2, 'Doska B', 'Izba 2', 7), row(3, 'Doska C', 'izba 1', 3)];
const REF = (propertyName: string, source: ColumnDefinition['source'] = 'attribute') => ({ source, propertyName });
const AREA = { source: 'quantity' as const, psetName: 'Qto_SlabBaseQuantities', propertyName: 'NetArea' };

describe('view: filter viditeľnosti (#276), šírky (#275) a zvýraznenie (#274)', () => {
  it('visibleOnly musí byť boolean', () => {
    assert.deepStrictEqual(parseListView({ visibleOnly: false }), { visibleOnly: false });
    assert.strictEqual(parseListView({ visibleOnly: 'no' }), null);
  });

  it('columnWidths: fit, auto, alebo stĺpce s px v rozsahu', () => {
    assert.deepStrictEqual(parseListView({ columnWidths: 'fit' }), { columnWidths: 'fit' });
    assert.deepStrictEqual(parseListView({ columnWidths: [{ column: AREA, width: 200 }, { column: REF('Name'), width: 'fit' }] }),
      { columnWidths: [{ column: AREA, width: 200 }, { column: REF('Name'), width: 'fit' }] });
    assert.strictEqual(parseListView({ columnWidths: 'wide' }), null);
    assert.strictEqual(parseListView({ columnWidths: [{ column: AREA, width: 10 }] }), null);
    assert.strictEqual(parseListView({ columnWidths: [{ column: AREA, width: 5000 }] }), null);
    assert.strictEqual(parseListView({ columnWidths: [] }), null);
  });

  it('highlight: riadky, stĺpce, bunky, súčet; null zruší; chybné celé zahodí', () => {
    const rows = { column: REF('Name'), values: ['Doska A'] };
    assert.deepStrictEqual(parseListView({ highlight: { rows, columns: [AREA], sum: true } }), { highlight: { rows, columns: [AREA], sum: true } });
    assert.deepStrictEqual(parseListView({ highlight: null }), { highlight: null });
    assert.deepStrictEqual(parseListView({ highlight: { sum: [AREA] } }), { highlight: { sum: [AREA] } });
    const cells = [{ column: AREA, row: { column: REF('Name'), value: 'Doska B' } }];
    assert.deepStrictEqual(parseListView({ highlight: { cells } }), { highlight: { cells } });
    assert.strictEqual(parseListView({ highlight: { rows: { column: REF('Name'), values: [] } } }), null);
    assert.strictEqual(parseListView({ highlight: { sum: 'all' } }), null);
    assert.strictEqual(parseListView({ highlight: { cells: [{ column: AREA, row: { column: REF('Name') } }] } }), null);
    assert.strictEqual(parseListView({ highlight: 'rows' }), null);
  });

  it('fit zmestí najdlhší obsah aj hlavičku a nepresiahne strop; auto zruší ručnú šírku', () => {
    const long = row(9, 'x'.repeat(100), '', 1);
    assert.strictEqual(fitColumnWidth('Name', [long], 0), 100 * 7 + 34);
    assert.strictEqual(fitColumnWidth('Dlhý názov stĺpca', [row(1, 'a')], 0), 'Dlhý názov stĺpca'.length * 7 + 58);
    assert.strictEqual(fitColumnWidth('A', [row(1, 'x'.repeat(500))], 0), 800);
    assert.strictEqual(fitColumnWidth('A', [], 0), 65);
    const plan = planColumnWidths([{ column: REF('Name'), width: 'fit' }, { column: AREA, width: 300 },
      { column: REF('Referenced', 'spatial'), width: 'auto' }, { column: REF('Chýba'), width: 'fit' }], COLUMNS, [long]);
    assert.deepStrictEqual(plan.set, { 'col-0': 100 * 7 + 34, 'col-2': 300 });
    assert.deepStrictEqual(plan.reset, ['col-1']);
    assert.deepStrictEqual(plan.missing, ['Chýba']);
    assert.deepStrictEqual(Object.keys(planColumnWidths('fit', COLUMNS, ROWS).set), ['col-0', 'col-1', 'col-2']);
    assert.deepStrictEqual(planColumnWidths('auto', COLUMNS, ROWS).reset, ['col-0', 'col-1', 'col-2']);
  });

  it('bunka sa porovná textom bez veľkosti písmen a čísla číselne', () => {
    assert.ok(cellEquals('Izba 1', 'izba 1'));
    assert.ok(cellEquals(12.5, 12.5));
    assert.ok(cellEquals(7, '7'));
    assert.ok(cellEquals('7', 7));
    assert.ok(!cellEquals(null, ''));
    assert.ok(cellEquals('', ''), 'prázdnu bunku sa dá zvýrazniť');
    assert.ok(!cellEquals('', 'x'));
    assert.ok(!cellEquals('Izba 12', 'Izba 1'));
  });

  it('resolveHighlight nájde riadky, bunky, stĺpce a súčty; neznámy stĺpec nahlási', () => {
    const r = resolveHighlight({
      rows: { column: REF('Referenced', 'spatial'), values: ['Izba 1'] },
      columns: [AREA, REF('Neexistuje')],
      cells: [{ column: AREA, row: { column: REF('Name'), value: 'Doska B' } }],
      sum: [AREA],
    }, COLUMNS, ROWS);
    assert.deepStrictEqual([...r.rowKeys].sort(), [rowKey(ROWS[0]), rowKey(ROWS[2])].sort());
    assert.deepStrictEqual([...r.columnIds], ['col-2']);
    assert.deepStrictEqual([...r.cellKeys], [cellKey(ROWS[1], 'col-2')]);
    assert.deepStrictEqual([...r.sumIds], ['col-2']);
    assert.strictEqual(r.sumAll, false);
    assert.deepStrictEqual(r.missing, ['Neexistuje']);
    assert.deepStrictEqual([...focusRowKeys(r)].sort(), ROWS.map(rowKey).sort());
    assert.strictEqual(resolveHighlight({ sum: true }, COLUMNS, ROWS).sumAll, true);
  });

  it('view_state opíše filter viditeľnosti, šírky a zvýraznenie menami stĺpcov', () => {
    const state = describeListState({ name: 'L', columns: COLUMNS, groups: [] }, {
      panelOpen: true, executing: false, rows: 3, maximized: false,
      table: { sort: null, search: '', visibleRows: 3, sums: [], visibleOnly: false,
        widths: [{ columnId: 'col-0', width: 120.4 }, { columnId: 'col-1', width: 300 }],
        highlight: { rows: 2, cells: 1, columnIds: ['col-2'], sum: ['col-2'] } },
    });
    assert.strictEqual(state.visible_only, false);
    assert.deepStrictEqual(state.column_widths, [{ column: 'Name', px: 120 }, { column: 'Priestor (referenced)', px: 300 }]);
    assert.deepStrictEqual(state.highlight, { rows: 2, cells: 1, columns: ['Qto_SlabBaseQuantities.NetArea'], sum: ['Qto_SlabBaseQuantities.NetArea'] });
  });
});
