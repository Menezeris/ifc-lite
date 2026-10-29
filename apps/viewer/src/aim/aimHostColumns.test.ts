/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { ListResult } from '@ifc-lite/lists';
import { MAX_HOST_VALUES, MAX_HOST_VALUE_CHARS, clearHostColumns, hostColumnSize, hostColumnValue, hostMatched, isHostValues, setHostColumn } from './aimHostColumns.js';
import { listDefinitionFromChat, parseOpenList, type OpenListMessage } from './aimListPlan.js';
import { editColumns, parseListEdit } from './aimListEditPlan.js';
import { describeListState, parseColumnRef } from './aimListViewPlan.js';
import type { LensInboundMessage } from './lens-protocol.js';

const HOST = { source: 'host' as const, propertyName: 'space_derived', label: 'Priestor (odvodený z DB)' };
const VALUES = { '0abc': 'Izba A', '1def': 'Izba B' };
const open = (columns: unknown[]): LensInboundMessage =>
  ({ source: 'aim-bridge', type: 'OPEN_LIST', name: 'VZT', groups: [{ combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcAirTerminal'] }] }], columns }) as LensInboundMessage;

describe('stĺpec od hosta: hodnoty (AIM D-174)', () => {
  it('isHostValues: mapa GlobalId -> text v limitoch', () => {
    assert.ok(isHostValues({}));
    assert.ok(isHostValues(VALUES));
    assert.ok(!isHostValues([]) && !isHostValues(null) && !isHostValues('x'));
    assert.ok(!isHostValues({ a: 1 }), 'hodnota nie je text');
    assert.ok(!isHostValues({ a: 'x'.repeat(MAX_HOST_VALUE_CHARS + 1) }), 'dlhá hodnota');
    assert.ok(isHostValues({ a: 'x'.repeat(MAX_HOST_VALUE_CHARS) }));
    assert.ok(!isHostValues({ '': 'x' }), 'prázdny kľúč');
    const many = Object.fromEntries(Array.from({ length: MAX_HOST_VALUES + 1 }, (_, i) => [`g${i}`, 'x']));
    assert.ok(!isHostValues(many), 'viac než 20 000 kľúčov');
  });

  it('store: hodnota podľa kľúča a GlobalId, nové hodnoty prepíšu staré, clear vyprázdni', () => {
    clearHostColumns();
    setHostColumn('space_derived', VALUES);
    assert.strictEqual(hostColumnValue('space_derived', '0abc'), 'Izba A');
    assert.strictEqual(hostColumnValue('space_derived', 'nie'), undefined);
    assert.strictEqual(hostColumnValue('iny', '0abc'), undefined);
    assert.strictEqual(hostColumnValue('space_derived', undefined), undefined);
    assert.strictEqual(hostColumnSize('space_derived'), 2);
    setHostColumn('space_derived', { '0abc': 'Izba Z' });
    assert.strictEqual(hostColumnValue('space_derived', '0abc'), 'Izba Z');
    assert.strictEqual(hostColumnValue('space_derived', '1def'), undefined, 'staré hodnoty sú preč');
    clearHostColumns();
    assert.strictEqual(hostColumnSize('space_derived'), 0);
  });
});

describe('stĺpec od hosta: OPEN_LIST (AIM D-174)', () => {
  it('stĺpec host s hodnotami prejde a vznikne stĺpec zoznamu bez hodnôt', () => {
    const msg = parseOpenList(open([{ source: 'attribute', propertyName: 'Name' }, { ...HOST, values: VALUES }]));
    assert.ok(msg, 'neznámy zdroj host sa nesmie zahodiť');
    const def = listDefinitionFromChat(msg as OpenListMessage, [], 'id', 0);
    assert.deepStrictEqual(def.columns[1], { id: 'col-1', source: 'host', propertyName: 'space_derived', label: HOST.label });
  });

  it('host bez hodnôt, so sadou, s neplatnými hodnotami alebo bez kľúča = neplatná správa', () => {
    assert.strictEqual(parseOpenList(open([{ ...HOST }])), null, 'bez values');
    assert.strictEqual(parseOpenList(open([{ ...HOST, values: VALUES, psetName: 'P' }])), null, 'psetName');
    assert.strictEqual(parseOpenList(open([{ ...HOST, values: { a: 5 } }])), null, 'hodnota nie je text');
    assert.strictEqual(parseOpenList(open([{ ...HOST, propertyName: '', values: VALUES }])), null, 'bez kľúča');
  });

  it('hodnoty na inom zdroji sa neprijmú', () => {
    assert.strictEqual(parseOpenList(open([{ source: 'attribute', propertyName: 'Name', values: VALUES }])), null);
  });

  it('column_ref {source: host} funguje v sum, sort a highlight (parseColumnRef)', () => {
    assert.deepStrictEqual(parseColumnRef({ source: 'host', propertyName: 'space_derived' }), { source: 'host', propertyName: 'space_derived' });
  });
});

describe('stĺpec od hosta: LIST_UPDATE edit (AIM D-174)', () => {
  const COLUMNS = [{ id: 'col-0', source: 'attribute' as const, propertyName: 'Name' }];

  it('addColumns nesie hodnoty, removeColumns len odkaz', () => {
    const ok = parseListEdit({ addColumns: [{ ...HOST, values: VALUES }], removeColumns: [{ source: 'host', propertyName: 'space_boundary_derived' }] });
    assert.deepStrictEqual(ok?.addColumns, [{ source: 'host', propertyName: 'space_derived', label: HOST.label, values: VALUES }]);
    assert.deepStrictEqual(ok?.removeColumns, [{ source: 'host', propertyName: 'space_boundary_derived' }]);
  });

  it('addColumns host bez hodnôt, hodnoty na inom zdroji alebo na odobratí = neplatné', () => {
    assert.strictEqual(parseListEdit({ addColumns: [HOST] }), null);
    assert.strictEqual(parseListEdit({ addColumns: [{ source: 'attribute', propertyName: 'Tag', values: VALUES }] }), null);
    assert.strictEqual(parseListEdit({ removeColumns: [{ source: 'host', propertyName: 'x', values: VALUES }] }), null);
  });

  it('editColumns pridá host stĺpec bez hodnôt a nezdvojí ho', () => {
    const edit = parseListEdit({ addColumns: [{ ...HOST, values: VALUES }] })!;
    const once = editColumns(COLUMNS, undefined, edit);
    assert.ok('columns' in once);
    assert.deepStrictEqual(once.columns[1], { id: 'col-1', source: 'host', propertyName: 'space_derived', label: HOST.label });
    const twice = editColumns(once.columns, undefined, edit);
    assert.ok('columns' in twice);
    assert.strictEqual(twice.columns.length, 2);
  });
});

describe('stĺpec od hosta: matched v stave (AIM D-174)', () => {
  const columns = [
    { id: 'col-0', source: 'attribute' as const, propertyName: 'Name' },
    { id: 'col-1', ...HOST },
  ];
  const result = {
    columns,
    rows: [
      { entityId: 1, modelId: 'm', values: ['a', 'Izba A'] },
      { entityId: 2, modelId: 'm', values: ['b', null] },
      { entityId: 3, modelId: 'm', values: ['c', 'Izba B'] },
    ],
  } as unknown as ListResult;

  it('hostMatched počíta riadky s hodnotou len pre host stĺpce', () => {
    assert.deepStrictEqual([...hostMatched(result)], [['col-1', 2]]);
  });

  it('view_state.list.columns: host stĺpec je {name, source, matched}, ostatné text', () => {
    const state = describeListState({ name: 'VZT', columns, groups: [] },
      { panelOpen: true, executing: false, rows: 3, table: null, maximized: false, hostMatched: hostMatched(result) });
    assert.deepStrictEqual(state.columns, ['Name', { name: HOST.label, source: 'host', matched: 2 }]);
  });

  it('host stĺpec bez zhody hlási matched 0', () => {
    const state = describeListState({ name: 'VZT', columns, groups: [] },
      { panelOpen: true, executing: false, rows: 0, table: null, maximized: false });
    assert.deepStrictEqual((state.columns as unknown[])[1], { name: HOST.label, source: 'host', matched: 0 });
  });
});
