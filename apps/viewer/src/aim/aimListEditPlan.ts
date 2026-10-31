/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Úprava obsahu otvoreného zoznamu z chatu (AIM D-149, krok 2): časť `edit` správy
 * `LIST_UPDATE` pridá alebo odoberie stĺpce a triedy entít a odoberie filtre. Čisté
 * funkcie nad `ListDefinition`; chyba je text pre `APPLIED` a zoznam sa vtedy nemení.
 * Lepidlo je v `aimListControl.ts`.
 */

import type { FilterGroup, FilterRule } from '@ifc-lite/rules';
import type { ColumnDefinition, ListGrouping } from '@ifc-lite/lists';
import { isHostValues } from './aimHostColumns.js';
import { findColumn, nextGrouping, parseColumnRef, refLabel, type AimListColumnRef } from './aimListViewPlan.js';

/** Druhy pravidiel, ktoré chat vie odobrať; `all` = všetky okrem tried. */
const FILTER_KINDS = new Set(['storey', 'model', 'property', 'group', 'globalId', 'name', 'predefinedType', 'all']);
const MAX_ITEMS = 16;
/** Pset a Qto stĺpec bez mena sady nie je stĺpec (ako `NEEDS_SET` v `aimListPlan.ts`). */
const NEEDS_SET = new Set<string>(['property', 'quantity']);

export interface AimListEdit {
  addColumns?: (AimListColumnRef & { label?: string; values?: Record<string, string> })[];
  removeColumns?: AimListColumnRef[];
  addTypes?: string[];
  removeTypes?: string[];
  removeFilters?: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (raw: unknown, ok: (s: string) => boolean): string[] | null =>
  Array.isArray(raw) && raw.length <= MAX_ITEMS && raw.every((s) => typeof s === 'string' && ok(s)) ? (raw as string[]) : null;
const isIfcClass = (s: string) => /^Ifc[A-Za-z0-9]{1,60}$/i.test(s);

/** Plná validácia `edit` zo správy hosta; `null` = neplatné (správa sa zahodí), bez `edit` prázdny objekt. */
export function parseListEdit(raw: unknown): AimListEdit | null {
  if (raw === undefined) return {};
  if (!isObj(raw)) return null;
  const out: AimListEdit = {};
  for (const key of ['addColumns', 'removeColumns'] as const) {
    if (raw[key] === undefined) continue;
    const list = raw[key];
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ITEMS) return null;
    const refs = list.map((c) => {
      const ref = parseColumnRef(c);
      if (!ref || (NEEDS_SET.has(ref.source) && !ref.psetName)) return null;
      const { label, values } = c as Record<string, unknown>;
      // Stĺpec od hosta (D-174): pri pridaní nesie hodnoty (prepíšu staré), pri odobratí len odkaz; iné zdroje hodnoty nemajú.
      const carriesValues = ref.source === 'host' && key === 'addColumns';
      if (carriesValues ? !ref.propertyName || ref.psetName !== undefined || !isHostValues(values) : values !== undefined) return null;
      const withValues = carriesValues ? { ...ref, values: values as Record<string, string> } : ref;
      if (label === undefined) return withValues;
      return typeof label === 'string' && label && label.length <= 120 ? { ...withValues, label } : null;
    });
    if (!refs.every((r) => r !== null)) return null;
    out[key] = refs as AimListColumnRef[];
  }
  for (const key of ['addTypes', 'removeTypes'] as const) {
    if (raw[key] === undefined) continue;
    const list = strList(raw[key], isIfcClass);
    if (!list || list.length === 0) return null;
    out[key] = list;
  }
  if (raw.removeFilters !== undefined) {
    const list = strList(raw.removeFilters, (s) => FILTER_KINDS.has(s));
    if (!list || list.length === 0) return null;
    out.removeFilters = list;
  }
  return out;
}

export const hasEdit = (e: AimListEdit) => Object.keys(e).length > 0;

type ColumnsOut = { columns: ColumnDefinition[]; grouping: ListGrouping | undefined; removed: string[] } | { error: string };

/**
 * Stĺpce po úprave: nové na koniec (s novým id, existujúci stĺpec sa nezdvojí), odobraté
 * zmiznú aj zo zoskupenia a súčtov. Neznámy stĺpec alebo zoznam bez stĺpcov = chyba.
 */
export function editColumns(columns: readonly ColumnDefinition[], grouping: ListGrouping | undefined, edit: AimListEdit): ColumnsOut {
  const removed: string[] = [];
  for (const ref of edit.removeColumns ?? []) {
    const col = findColumn(columns, ref);
    if (!col) return { error: `stĺpec ${refLabel(ref)} v zozname nie je` };
    removed.push(col.id);
  }
  const kept = columns.filter((c) => !removed.includes(c.id));
  let next = Math.max(-1, ...columns.map((c) => Number(/^col-(\d+)$/.exec(c.id)?.[1] ?? -1))) + 1;
  const out = [...kept];
  for (const ref of edit.addColumns ?? []) {
    if (findColumn(out, ref)) continue;
    const { label, values: _values, ...rest } = ref as AimListColumnRef & { label?: string; values?: unknown };
    out.push({ id: `col-${next++}`, ...rest, ...(label ? { label } : {}) });
  }
  if (out.length === 0) return { error: 'zoznam by ostal bez stĺpcov' };
  if (removed.length === 0) return { columns: out, grouping, removed };
  const prevGroups = grouping ? (grouping.columnIds?.length ? grouping.columnIds : grouping.columnId ? [grouping.columnId] : []) : [];
  const g = nextGrouping(grouping, prevGroups.filter((id) => !removed.includes(id)),
    (grouping?.sumColumnIds ?? []).filter((id) => !removed.includes(id)));
  return { columns: out, grouping: g, removed };
}

const fold = (s: string) => s.trim().toLowerCase();
const isTypeRule = (r: FilterRule): r is Extract<FilterRule, { kind: 'ifcType' }> => r.kind === 'ifcType' && r.op === 'in';

/**
 * Triedy entít po úprave: pravidlo "IFC trieda je jedna z" v každej skupine sa rozšíri
 * alebo zúži. Zoznam bez takého pravidla by pridanie triedy zúžilo, preto je to chyba,
 * rovnako ako odobratie triedy, ktorá v zozname nie je, alebo poslednej triedy.
 */
export function editTypes(groups: readonly FilterGroup[], edit: AimListEdit): FilterGroup[] | string {
  const add = edit.addTypes ?? [];
  const remove = new Set((edit.removeTypes ?? []).map(fold));
  if (add.length === 0 && remove.size === 0) return [...groups];
  const live = groups.filter((g) => g.rules.length > 0);
  if (!live.some((g) => g.rules.some(isTypeRule))) {
    return 'zoznam nemá filter IFC tried; otvor nový zoznam cez open_list s ifc_types';
  }
  const seen = new Set<string>();
  const out: FilterGroup[] = [];
  for (const g of live) {
    const rules: FilterRule[] = [];
    for (const r of g.rules) {
      if (!isTypeRule(r)) {
        rules.push(r);
        continue;
      }
      r.values.forEach((v) => remove.has(fold(v)) && seen.add(fold(v)));
      const values = r.values.filter((v) => !remove.has(fold(v)));
      for (const t of add) if (!values.some((v) => fold(v) === fold(t))) values.push(t);
      if (values.length === 0) return 'zoznam by ostal bez tried; odober triedu až po pridaní inej';
      rules.push({ ...r, values });
    }
    out.push({ ...g, rules });
  }
  const missing = (edit.removeTypes ?? []).filter((t) => !seen.has(fold(t)));
  if (missing.length) return `trieda ${missing.join(', ')} v zozname nie je`;
  return out;
}

/**
 * Filtre po odobratí druhov pravidiel (`all` = všetky okrem tried). Skupina bez pravidiel
 * odpadne; zoznam bez jediného pravidla by niesol celý model, preto je to chyba.
 */
export function removeFilterKinds(groups: readonly FilterGroup[], kinds: readonly string[]): FilterGroup[] | string {
  if (kinds.length === 0) return [...groups];
  const all = kinds.includes('all');
  const drop = (r: FilterRule) => (all ? r.kind !== 'ifcType' : kinds.includes(r.kind));
  if (!all && !groups.some((g) => g.rules.some(drop))) return `zoznam nemá filter ${kinds.join(', ')}`;
  const out = groups.map((g) => ({ ...g, rules: g.rules.filter((r) => !drop(r)) })).filter((g) => g.rules.length > 0);
  if (out.length === 0) return 'zoznam by ostal bez filtra (celý model); nechaj aspoň triedu alebo podlažie';
  return out;
}
