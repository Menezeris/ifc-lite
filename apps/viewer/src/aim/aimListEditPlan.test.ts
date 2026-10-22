/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { ColumnDefinition, ListGrouping } from '@ifc-lite/lists';
import type { FilterGroup } from '@ifc-lite/rules';
import { editColumns, editTypes, hasEdit, parseListEdit, removeFilterKinds } from './aimListEditPlan.js';
import { andGroups, describeListState, parseListView } from './aimListViewPlan.js';

const COLUMNS: ColumnDefinition[] = [
  { id: 'col-0', source: 'attribute', propertyName: 'Name' },
  { id: 'col-1', source: 'spatial', propertyName: 'Storey', label: 'Podlažie' },
  { id: 'col-2', source: 'quantity', psetName: 'Qto_ColumnBaseQuantities', propertyName: 'NetVolume' },
];
const VOL = { source: 'quantity' as const, psetName: 'Qto_ColumnBaseQuantities', propertyName: 'NetVolume' };
const FIRE = { source: 'property' as const, psetName: 'Pset_ColumnCommon', propertyName: 'FireRating' };
const rule = (r: Record<string, unknown>) => r as never;
const TYPES = rule({ kind: 'ifcType', op: 'in', values: ['IfcColumn'] });
const NP1 = rule({ kind: 'storey', op: 'in', values: ['1NP'] });
const ASR = rule({ kind: 'model', op: 'in', values: ['fp-asr'] });
const PROP = rule({ kind: 'property', psetName: 'Pset_ColumnCommon', propertyName: 'LoadBearing', op: 'equals', value: 'true' });
const LIST: FilterGroup[] = [{ combinator: 'AND', rules: [TYPES, NP1, PROP] }];

describe('úprava obsahu zoznamu z chatu (AIM D-149, krok 2)', () => {
  it('edit: platný prejde, chybný celý zahodí', () => {
    assert.deepStrictEqual(parseListEdit(undefined), {});
    assert.strictEqual(hasEdit({}), false);
    const ok = parseListEdit({ addColumns: [{ ...FIRE, label: 'Požiar' }], removeColumns: [VOL], addTypes: ['IfcBeam'],
      removeTypes: ['IfcColumn'], removeFilters: ['storey', 'all'] });
    assert.deepStrictEqual(ok, { addColumns: [{ ...FIRE, label: 'Požiar' }], removeColumns: [VOL], addTypes: ['IfcBeam'],
      removeTypes: ['IfcColumn'], removeFilters: ['storey', 'all'] });
    assert.strictEqual(hasEdit(ok!), true);
    assert.strictEqual(parseListEdit({ addTypes: ['Beam'] }), null);
    assert.strictEqual(parseListEdit({ addTypes: [] }), null);
    assert.strictEqual(parseListEdit({ removeFilters: ['ifcType'] }), null);
    assert.strictEqual(parseListEdit({ addColumns: [{ source: 'property', propertyName: 'X' }] }), null, 'pset bez sady');
    assert.strictEqual(parseListEdit({ addColumns: [{ ...FIRE, label: 5 }] }), null);
    assert.strictEqual(parseListEdit([]), null);
  });

  it('stĺpce: nové na koniec s novým id bez duplicít, odobratý zmizne aj zo zoskupenia a súčtov', () => {
    const grouping: ListGrouping = { columnId: 'col-1', columnIds: ['col-1'], sumColumnIds: ['col-2'], view: 'schedule' };
    const out = editColumns(COLUMNS, grouping, { addColumns: [FIRE, { ...VOL }], removeColumns: [{ source: 'spatial', propertyName: 'Podlažie' }] });
    assert.ok(!('error' in out));
    assert.deepStrictEqual(out.columns.map((c) => c.id), ['col-0', 'col-2', 'col-3']);
    assert.deepStrictEqual(out.columns[2], { id: 'col-3', ...FIRE });
    assert.deepStrictEqual(out.removed, ['col-1']);
    assert.deepStrictEqual(out.grouping, { columnId: '', columnIds: [], sumColumnIds: ['col-2'], view: 'schedule' });
    const gone = editColumns(COLUMNS, { columnId: 'col-1', columnIds: ['col-1'], sumColumnIds: [] }, { removeColumns: [{ source: 'spatial', propertyName: 'Storey' }] });
    assert.ok(!('error' in gone) && gone.grouping === undefined, 'bez zoskupenia aj súčtov je grouping preč');
    const same = editColumns(COLUMNS, grouping, { addColumns: [FIRE] });
    assert.ok(!('error' in same) && same.grouping === grouping);
  });

  it('stĺpce: neznámy alebo posledný stĺpec je chyba', () => {
    assert.deepStrictEqual(editColumns(COLUMNS, undefined, { removeColumns: [FIRE] }), { error: 'stĺpec Pset_ColumnCommon.FireRating v zozname nie je' });
    assert.deepStrictEqual(editColumns(COLUMNS.slice(0, 1), undefined, { removeColumns: [{ source: 'attribute', propertyName: 'Name' }] }),
      { error: 'zoznam by ostal bez stĺpcov' });
  });

  it('triedy: rozšíri a zúži pravidlo IFC trieda v každej skupine', () => {
    const two: FilterGroup[] = [...LIST, { combinator: 'AND', rules: [TYPES, ASR] }];
    const out = editTypes(two, { addTypes: ['IfcBeam', 'ifccolumn'], removeTypes: [] });
    assert.ok(Array.isArray(out));
    assert.deepStrictEqual(out.map((g) => (g.rules[0] as { values: string[] }).values), [['IfcColumn', 'IfcBeam'], ['IfcColumn', 'IfcBeam']]);
    assert.deepStrictEqual(out[0].rules.slice(1), [NP1, PROP], 'ostatné pravidlá ostanú');
    const narrowed = editTypes(out, { removeTypes: ['IFCCOLUMN'] });
    assert.ok(Array.isArray(narrowed));
    assert.deepStrictEqual((narrowed[0].rules[0] as { values: string[] }).values, ['IfcBeam']);
  });

  it('triedy: zoznam bez tried, neznáma alebo posledná trieda je chyba', () => {
    assert.match(String(editTypes([{ combinator: 'AND', rules: [NP1] }], { addTypes: ['IfcBeam'] })), /nemá filter IFC tried/);
    assert.strictEqual(editTypes(LIST, { removeTypes: ['IfcWall'] }), 'trieda IfcWall v zozname nie je');
    assert.match(String(editTypes(LIST, { removeTypes: ['IfcColumn'] })), /bez tried/);
    assert.deepStrictEqual(editTypes(LIST, {}), LIST);
  });

  it('filtre: odobratie druhu, all nechá triedy, celý model je chyba', () => {
    assert.deepStrictEqual(removeFilterKinds(LIST, ['storey']), [{ combinator: 'AND', rules: [TYPES, PROP] }]);
    assert.deepStrictEqual(removeFilterKinds(LIST, ['all']), [{ combinator: 'AND', rules: [TYPES] }]);
    assert.match(String(removeFilterKinds(LIST, ['model'])), /nemá filter model/);
    assert.match(String(removeFilterKinds([{ combinator: 'AND', rules: [NP1] }], ['all'])), /celý model/);
    assert.deepStrictEqual(removeFilterKinds(LIST, []), LIST);
  });

  it('podlažie a model sa prepínajú: nové pravidlo nahradí staré, ostatné filtre sa pridajú cez AND', () => {
    const NP3 = rule({ kind: 'storey', op: 'in', values: ['3NP'] });
    const out = andGroups([{ combinator: 'AND', rules: [TYPES, NP1, ASR] }], [{ combinator: 'AND', rules: [NP3] }]);
    assert.deepStrictEqual(out, [{ combinator: 'AND', rules: [TYPES, ASR, NP3] }]);
    const both = andGroups([{ combinator: 'OR', rules: [NP1] }], [{ combinator: 'AND', rules: [NP3, PROP] }]);
    assert.deepStrictEqual(both, [{ combinator: 'AND', rules: [NP3, PROP] }], 'OR skupina, z ktorej ostane nič, sa dá zúžiť');
  });

  it('view: farby a export; stav ich povie', () => {
    assert.deepStrictEqual(parseListView({ colorBy: FIRE, export: 'xlsx' }), { colorBy: FIRE, export: 'xlsx' });
    assert.deepStrictEqual(parseListView({ colorBy: null }), { colorBy: null });
    assert.strictEqual(parseListView({ export: 'docx' }), null);
    assert.strictEqual(parseListView({ colorBy: { source: 'nope', propertyName: 'X' } }), null);
    const state = describeListState({ name: 'Stĺpy', columns: COLUMNS, groups: LIST }, {
      panelOpen: true, executing: false, rows: 3, table: null, maximized: false, colorBy: 'col-2', exportReady: 'csv',
    });
    assert.strictEqual(state.color_by, 'Qto_ColumnBaseQuantities.NetVolume');
    assert.strictEqual(state.export_ready, 'csv');
    const plain = describeListState({ name: 'Stĺpy', columns: COLUMNS, groups: LIST }, { panelOpen: true, executing: false, rows: 3, table: null, maximized: false });
    assert.ok(!('color_by' in plain) && !('export_ready' in plain));
  });
});
