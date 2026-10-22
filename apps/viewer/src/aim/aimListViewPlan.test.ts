/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { ColumnDefinition } from '@ifc-lite/lists';
import type { FilterGroup } from '@ifc-lite/rules';
import { andGroups, describeGroups, describeListState, findColumn, nextGrouping, parseAddedGroups, parseListView } from './aimListViewPlan.js';
import { parseOpenList } from './aimListPlan.js';
import type { LensInboundMessage } from './lens-protocol.js';

const COLUMNS: ColumnDefinition[] = [
  { id: 'col-0', source: 'attribute', propertyName: 'Name' },
  { id: 'col-1', source: 'spatial', propertyName: 'Storey', label: 'Podlažie' },
  { id: 'col-2', source: 'quantity', psetName: 'Qto_ColumnBaseQuantities', propertyName: 'NetVolume' },
];
const VOL = { source: 'quantity' as const, psetName: 'Qto_ColumnBaseQuantities', propertyName: 'NetVolume' };
const COLS: FilterGroup = { combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcColumn'] } as never] };
const NP3: FilterGroup = { combinator: 'AND', rules: [{ kind: 'globalId', op: 'in', values: ['a', 'b'] } as never] };

describe('view zoznamu z chatu (AIM D-149)', () => {
  it('platné view prejde, chybné celé zahodí', () => {
    assert.deepStrictEqual(parseListView(undefined), {});
    assert.deepStrictEqual(parseListView({ maximize: true, sort: { column: VOL, dir: 'desc' }, sum: [VOL], groupBy: [], search: '3NP' }),
      { maximize: true, sort: { column: VOL, dir: 'desc' }, sum: [VOL], groupBy: [], search: '3NP' });
    assert.deepStrictEqual(parseListView({ sort: null }), { sort: null });
    assert.strictEqual(parseListView({ maximize: 'yes' }), null);
    assert.strictEqual(parseListView({ sort: { column: VOL, dir: 'up' } }), null);
    assert.strictEqual(parseListView({ sum: [{ source: 'sql', propertyName: 'x' }] }), null);
    assert.strictEqual(parseListView({ search: 'x'.repeat(201) }), null);
    assert.strictEqual(parseListView([]), null);
  });

  it('OPEN_LIST s chybným view viewer odmietne', () => {
    const msg = (view: unknown) => ({ source: 'aim-bridge', type: 'OPEN_LIST', name: 'Stĺpy', groups: [COLS],
      columns: [{ source: 'attribute', propertyName: 'Name' }], view }) as unknown as LensInboundMessage;
    assert.ok(parseOpenList(msg({ sum: [VOL] })));
    assert.strictEqual(parseOpenList(msg({ maximize: 1 })), null);
  });

  it('stĺpec sa nájde podľa zdroja a mena, inak podľa popisu; cudzí nie', () => {
    assert.strictEqual(findColumn(COLUMNS, VOL)?.id, 'col-2');
    assert.strictEqual(findColumn(COLUMNS, { source: 'quantity', propertyName: 'netvolume' })?.id, 'col-2');
    assert.strictEqual(findColumn(COLUMNS, { source: 'spatial', propertyName: 'storey' })?.id, 'col-1');
    assert.strictEqual(findColumn(COLUMNS, { source: 'attribute', propertyName: 'Podlažie' })?.id, 'col-1');
    assert.strictEqual(findColumn(COLUMNS, { source: 'quantity', psetName: 'Qto_WallBaseQuantities', propertyName: 'NetVolume' }), null);
    assert.strictEqual(findColumn(COLUMNS, { source: 'property', psetName: 'Pset_ColumnCommon', propertyName: 'FireRating' }), null);
  });

  it('nový filter zúži každú skupinu (AND); OR so zoznamom bez vnorenia nejde', () => {
    assert.deepStrictEqual(andGroups([COLS], [NP3]), [{ combinator: 'AND', rules: [...COLS.rules, ...NP3.rules] }]);
    const two: FilterGroup = { combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcBeam'] } as never] };
    assert.strictEqual(andGroups([COLS, two], [NP3])?.length, 2);
    assert.deepStrictEqual(andGroups([], [NP3]), [{ combinator: 'AND', rules: NP3.rules }]);
    assert.deepStrictEqual(andGroups([COLS], []), [COLS]);
    const or: FilterGroup = { combinator: 'OR', rules: [...COLS.rules, ...two.rules] };
    assert.strictEqual(andGroups([or], [NP3]), null);
    assert.strictEqual(andGroups([COLS], [or]), null);
    assert.deepStrictEqual(parseAddedGroups(undefined), []);
    assert.strictEqual(parseAddedGroups([{ rules: 'x' }]), null);
  });

  it('zoskupenie a súčty: nezadané ostanú, prázdne zrušia', () => {
    const g = nextGrouping(undefined, undefined, ['col-2']);
    assert.deepStrictEqual(g, { columnId: '', columnIds: [], sumColumnIds: ['col-2'] });
    const both = nextGrouping({ ...g!, view: 'schedule' }, ['col-1'], undefined);
    assert.deepStrictEqual(both, { columnId: 'col-1', columnIds: ['col-1'], sumColumnIds: ['col-2'], view: 'schedule' });
    assert.deepStrictEqual(nextGrouping({ columnId: 'col-1', sumColumnIds: [] }, undefined, ['col-2'])?.columnIds, ['col-1']);
    assert.strictEqual(nextGrouping(both, [], []), undefined);
  });

  it('stav zoznamu nesie mená stĺpcov, filtre, zoradenie a súčty v jednotke tabuľky', () => {
    const state = describeListState(
      { name: 'Stĺpy', columns: COLUMNS, groups: [{ combinator: 'AND', rules: [...COLS.rules, ...NP3.rules] }],
        grouping: { columnId: 'col-1', columnIds: ['col-1'], sumColumnIds: ['col-2'] } },
      { panelOpen: true, executing: false, rows: 52, maximized: true,
        table: { sort: { columnId: 'col-2', dir: 'desc' }, search: '', visibleRows: 7, sums: [{ columnId: 'col-2', value: 17.57750000001, unit: 'm³' }] } },
    );
    assert.deepStrictEqual(state, {
      name: 'Stĺpy', panel_open: true, has_result: true, rows: 52, visible_rows: 7,
      columns: ['Name', 'Podlažie', 'Qto_ColumnBaseQuantities.NetVolume'],
      filters: ['ifcType in IfcColumn A globalId in a, b'],
      sort: { column: 'Qto_ColumnBaseQuantities.NetVolume', dir: 'desc' },
      group_by: ['Podlažie'], sum_columns: ['Qto_ColumnBaseQuantities.NetVolume'],
      sums: [{ column: 'Qto_ColumnBaseQuantities.NetVolume', value: 17.5775, unit: 'm³' }],
      maximized: true,
    });
    const builder = describeListState({ name: 'X', columns: COLUMNS, groups: [] },
      { panelOpen: true, executing: false, rows: null, table: null, maximized: false });
    assert.strictEqual(builder.has_result, false);
    assert.deepStrictEqual(builder.sums, []);
    assert.deepStrictEqual(describeGroups([{ combinator: 'OR', rules: [{ kind: 'globalId', op: 'in', values: ['1', '2', '3', '4'] } as never] }]), ['globalId in 4 hodnôt']);
  });
});
