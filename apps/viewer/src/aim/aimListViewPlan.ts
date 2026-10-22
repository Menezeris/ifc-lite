/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Úpravy otvoreného zoznamu z chatu (AIM D-149, "Excel hlasom"): validácia časti
 * `view` v `OPEN_LIST` a `LIST_UPDATE`, nájdenie stĺpca zoznamu podľa mena,
 * pridanie filtra (AND) k filtrom zoznamu, zoskupenie a súčty v tvare upstream
 * `ListGrouping` a opis stavu zoznamu pre `view_state`. Store sa tu nečíta;
 * lepidlo je v `aimListControl.ts`.
 */

import { isFilterGroup, type FilterGroup } from '@ifc-lite/rules';
import type { ColumnDefinition, ListGrouping } from '@ifc-lite/lists';

/** Stĺpec zoznamu tak, ako ho pomenuje host (bez id). */
export interface AimListColumnRef {
  source: ColumnDefinition['source'];
  propertyName: string;
  psetName?: string;
}

export interface AimListView {
  /** true = spodný pruh s panelom Lists na celú plochu viewera, false = späť. */
  maximize?: boolean;
  /** Zoradenie tabuľky; `null` = zrušiť. */
  sort?: { column: AimListColumnRef; dir: 'asc' | 'desc' } | null;
  /** Stĺpce so súčtom (prázdne = bez súčtov). */
  sum?: AimListColumnRef[];
  /** Zoskupenie, vonkajšie prvé (prázdne = bez zoskupenia). */
  groupBy?: AimListColumnRef[];
  /** Rýchle hľadanie v riadkoch tabuľky (prázdne = zrušiť). */
  search?: string;
}

const MAX_VIEW_COLUMNS = 8;
const SOURCES = new Set<string>(['attribute', 'property', 'quantity', 'material', 'classification', 'spatial', 'model', 'zone', 'geometry']);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseColumnRef(raw: unknown): AimListColumnRef | null {
  if (!isObj(raw) || typeof raw.source !== 'string' || !SOURCES.has(raw.source)) return null;
  if (typeof raw.propertyName !== 'string' || raw.propertyName.length > 200) return null;
  if (raw.psetName !== undefined && (typeof raw.psetName !== 'string' || !raw.psetName || raw.psetName.length > 200)) return null;
  return {
    source: raw.source as ColumnDefinition['source'],
    propertyName: raw.propertyName,
    ...(raw.psetName ? { psetName: raw.psetName as string } : {}),
  };
}

function parseColumnRefs(raw: unknown): AimListColumnRef[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_VIEW_COLUMNS) return null;
  const out = raw.map(parseColumnRef);
  return out.every((c): c is AimListColumnRef => c !== null) ? out : null;
}

/** Plná validácia `view` zo správy hosta; `null` = neplatné (správa sa zahodí), bez `view` prázdny objekt. */
export function parseListView(raw: unknown): AimListView | null {
  if (raw === undefined) return {};
  if (!isObj(raw)) return null;
  const out: AimListView = {};
  if (raw.maximize !== undefined) {
    if (typeof raw.maximize !== 'boolean') return null;
    out.maximize = raw.maximize;
  }
  if (raw.sort !== undefined) {
    if (raw.sort === null) out.sort = null;
    else {
      if (!isObj(raw.sort) || (raw.sort.dir !== 'asc' && raw.sort.dir !== 'desc')) return null;
      const column = parseColumnRef(raw.sort.column);
      if (!column) return null;
      out.sort = { column, dir: raw.sort.dir };
    }
  }
  for (const key of ['sum', 'groupBy'] as const) {
    if (raw[key] === undefined) continue;
    const refs = parseColumnRefs(raw[key]);
    if (!refs) return null;
    out[key] = refs;
  }
  if (raw.search !== undefined) {
    if (typeof raw.search !== 'string' || raw.search.length > 200) return null;
    out.search = raw.search;
  }
  return out;
}

/** Filtre `LIST_UPDATE`: `FilterGroup[]` (najviac 8), prázdne = bez nového filtra. */
export function parseAddedGroups(raw: unknown): FilterGroup[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 8 || !raw.every(isFilterGroup)) return null;
  return raw as FilterGroup[];
}

const fold = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/** Meno stĺpca pre ľudí a pre `view_state` (popis, inak `Sada.Vlastnosť` alebo meno). */
export function columnLabel(c: Pick<ColumnDefinition, 'label' | 'propertyName' | 'psetName' | 'source'>): string {
  if (c.label) return c.label;
  if (c.psetName && (c.source === 'property' || c.source === 'quantity')) return `${c.psetName}.${c.propertyName}`;
  return c.propertyName || c.source;
}

/**
 * Stĺpec zoznamu pre meno od hosta: zdroj a meno (pri psete aj sada) bez ohľadu na
 * veľkosť písmen; inak zhoda popisu stĺpca, bez sady aj mena. null = zoznam taký stĺpec nemá.
 */
export function findColumn(columns: readonly ColumnDefinition[], ref: AimListColumnRef): ColumnDefinition | null {
  const name = fold(ref.propertyName);
  const exact = columns.find((c) => c.source === ref.source && fold(c.propertyName) === name
    && (ref.psetName === undefined || fold(c.psetName) === fold(ref.psetName)));
  if (exact) return exact;
  // Iná sada (Qto_WallBaseQuantities vs Qto_ColumnBaseQuantities) nie je ten istý stĺpec.
  const byName = (c: ColumnDefinition) => fold(c.label) === name || (ref.psetName === undefined && fold(c.propertyName) === name);
  return columns.find((c) => name && byName(c)) ?? null;
}

/** Meno stĺpca od hosta pre hlásenie, že ho zoznam nemá. */
export const refLabel = (ref: AimListColumnRef) => (ref.psetName ? `${ref.psetName}.${ref.propertyName}` : ref.propertyName || ref.source);

/**
 * Pridá filtre (AND) k filtrom zoznamu. Skupiny zoznamu sa medzi sebou spájajú ako OR,
 * preto sa nové pravidlá pridajú do každej skupiny; skupina OR s viac pravidlami sa
 * bez vnorenia zúžiť nedá (`null`). Zoznam bez filtrov dostane nové skupiny.
 */
export function andGroups(existing: readonly FilterGroup[], added: readonly FilterGroup[]): FilterGroup[] | null {
  const rules = added.flatMap((g) => (g.combinator === 'AND' || g.rules.length === 1 ? g.rules : []));
  if (rules.length !== added.reduce((n, g) => n + g.rules.length, 0)) return null;
  if (rules.length === 0) return [...existing];
  const live = existing.filter((g) => g.rules.length > 0);
  if (live.length === 0) return [{ combinator: 'AND', rules }];
  const out: FilterGroup[] = [];
  for (const g of live) {
    if (g.combinator === 'OR' && g.rules.length > 1) return null;
    out.push({ combinator: 'AND', rules: [...g.rules, ...rules] });
  }
  return out;
}

/** Nové zoskupenie a súčty nad predošlými (nezadané ostanú); bez oboch `undefined` ako upstream `rebuildGrouping`. */
export function nextGrouping(prev: ListGrouping | undefined, groupIds: string[] | undefined, sumIds: string[] | undefined): ListGrouping | undefined {
  const prevGroups = prev ? (prev.columnIds?.length ? prev.columnIds : prev.columnId ? [prev.columnId] : []) : [];
  const columnIds = groupIds ?? prevGroups;
  const sumColumnIds = sumIds ?? prev?.sumColumnIds ?? [];
  if (columnIds.length === 0 && sumColumnIds.length === 0) return undefined;
  return { ...prev, columnId: columnIds[0] ?? '', columnIds, sumColumnIds };
}

const short = (v: unknown) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

/** Krátky opis pravidla filtra pre `view_state` (druh a hodnoty, dlhé zoznamy len počtom). */
export function describeRule(rule: unknown): string {
  if (!isObj(rule)) return '?';
  const kind = short(rule.kind) || '?';
  const field = [short(rule.psetName), short(rule.propertyName) || short(rule.attribute)].filter(Boolean).join('.');
  const values = Array.isArray(rule.values) ? rule.values : Array.isArray(rule.refs) ? rule.refs : null;
  let value = '';
  if (values) value = values.length > 3 ? `${values.length} hodnôt` : values.map((v) => short(v) || (isObj(v) ? short(v.name) || '#' : '?')).join(', ');
  else value = short(rule.value) || short(rule.pattern);
  const op = short(rule.op) || short(rule.operator);
  return [kind, field, op, value].filter(Boolean).join(' ');
}

/** Opis filtrov zoznamu: jedna položka na skupinu, pravidlá spojené jej spojkou. */
export function describeGroups(groups: readonly FilterGroup[]): string[] {
  return groups.filter((g) => g.rules.length > 0).map((g) => g.rules.map(describeRule).join(g.combinator === 'AND' ? ' A ' : ' ALEBO '));
}

/** Čo o zozname vie viewer mimo definície (store, hák tabuľky, hák pruhu). */
export interface ListStateInput {
  panelOpen: boolean;
  executing: boolean;
  /** Počet riadkov výsledku tejto definície; null = zoznam ešte nebežal. */
  rows: number | null;
  table: { sort: { columnId: string; dir: 'asc' | 'desc' } | null; search: string; visibleRows: number;
    sums: { columnId: string; value: number; unit?: string }[] } | null;
  maximized: boolean;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** Stav zoznamu pre `view_state` a `APPLIED` (AIM D-149): mená stĺpcov namiesto id. */
export function describeListState(def: { name: string; columns: ColumnDefinition[]; groups: FilterGroup[]; grouping?: ListGrouping }, s: ListStateInput): Record<string, unknown> {
  const label = (id: string) => {
    const c = def.columns.find((col) => col.id === id);
    return c ? columnLabel(c) : id;
  };
  const g = def.grouping;
  const groupIds = g ? (g.columnIds?.length ? g.columnIds : g.columnId ? [g.columnId] : []) : [];
  return {
    name: def.name,
    panel_open: s.panelOpen,
    has_result: s.rows !== null,
    ...(s.executing ? { executing: true } : {}),
    ...(s.rows !== null ? { rows: s.rows } : {}),
    ...(s.table ? { visible_rows: s.table.visibleRows } : {}),
    columns: def.columns.map(columnLabel),
    filters: describeGroups(def.groups),
    sort: s.table?.sort ? { column: label(s.table.sort.columnId), dir: s.table.sort.dir } : null,
    ...(s.table?.search ? { search: s.table.search } : {}),
    group_by: groupIds.map(label),
    sum_columns: (g?.sumColumnIds ?? []).map(label),
    // Súčty sú za riadky, ktoré tabuľka ukazuje (po hľadaní a "len viditeľné"), v jej jednotke.
    sums: (s.table?.sums ?? []).map((x) => ({ column: label(x.columnId), value: round(x.value), ...(x.unit ? { unit: x.unit } : {}) })),
    maximized: s.maximized,
  };
}
