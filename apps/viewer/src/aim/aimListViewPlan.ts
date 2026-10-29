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
  /** Farby prvkov v 3D podľa hodnoty stĺpca (upstream "Color by"); `null` = zrušiť. */
  colorBy?: AimListColumnRef | null;
  /** Formát, ktorý sa ponúkne na stiahnutie zvýrazneným tlačidlom (klik je na používateľovi). */
  export?: AimListExportFormat;
  /** Filter tabuľky "len viditeľné v 3D" (#276); `false` ukáže všetky riadky aj pri izolácii v 3D. */
  visibleOnly?: boolean;
  /** Šírky stĺpcov (#275): `fit` / `auto` pre všetky, alebo po jednom. */
  columnWidths?: AimColumnWidths;
  /** Zvýraznenie riadkov, stĺpcov, buniek a súčtu (#274); `null` = zrušiť. */
  highlight?: AimListHighlight | null;
}

export const MIN_COLUMN_WIDTH = 56;
export const MAX_COLUMN_WIDTH = 800;
/** `fit` = podľa najdlhšieho obsahu a hlavičky, `auto` = predvolená šírka tabuľky, číslo = px. */
export type AimColumnWidth = number | 'fit' | 'auto';
export type AimColumnWidths = 'fit' | 'auto' | { column: AimListColumnRef; width: AimColumnWidth }[];

/** Riadky, ktorých bunka v stĺpci sa rovná niektorej hodnote (text bez ohľadu na veľkosť písmen, číslo číselne). */
export interface AimRowMatch {
  column: AimListColumnRef;
  values: (string | number)[];
}
export interface AimListHighlight {
  rows?: AimRowMatch;
  columns?: AimListColumnRef[];
  /** Bunka = stĺpec `column` v riadku, kde `row.column` sa rovná `row.value`. */
  cells?: { column: AimListColumnRef; row: { column: AimListColumnRef; value: string | number } }[];
  /** `true` = celý riadok súčtov, alebo len súčty týchto stĺpcov. */
  sum?: true | AimListColumnRef[];
}

export type AimListExportFormat = 'csv' | 'xlsx' | 'pdf';
const EXPORT_FORMATS = new Set<string>(['csv', 'xlsx', 'pdf']);

const MAX_VIEW_COLUMNS = 8;
const SOURCES = new Set<string>(['attribute', 'property', 'quantity', 'material', 'classification', 'spatial', 'model', 'zone', 'geometry']);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseColumnRef(raw: unknown): AimListColumnRef | null {
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

const MAX_MATCH_VALUES = 200;
const isCellValue = (v: unknown): v is string | number =>
  (typeof v === 'string' && v.length <= 200) || (typeof v === 'number' && Number.isFinite(v));

function parseRowMatch(raw: unknown): AimRowMatch | null {
  if (!isObj(raw) || !Array.isArray(raw.values) || raw.values.length === 0 || raw.values.length > MAX_MATCH_VALUES) return null;
  const column = parseColumnRef(raw.column);
  return column && raw.values.every(isCellValue) ? { column, values: raw.values as (string | number)[] } : null;
}

export function parseColumnWidths(raw: unknown): AimColumnWidths | null {
  if (raw === 'fit' || raw === 'auto') return raw;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const out: { column: AimListColumnRef; width: AimColumnWidth }[] = [];
  for (const item of raw) {
    if (!isObj(item)) return null;
    const column = parseColumnRef(item.column);
    const w = item.width;
    const ok = w === 'fit' || w === 'auto' || (typeof w === 'number' && Number.isFinite(w) && w >= MIN_COLUMN_WIDTH && w <= MAX_COLUMN_WIDTH);
    if (!column || !ok) return null;
    out.push({ column, width: w as AimColumnWidth });
  }
  return out;
}

export function parseHighlight(raw: unknown): AimListHighlight | null {
  if (!isObj(raw)) return null;
  const out: AimListHighlight = {};
  if (raw.rows !== undefined) {
    const rows = parseRowMatch(raw.rows);
    if (!rows) return null;
    out.rows = rows;
  }
  if (raw.columns !== undefined) {
    const columns = parseColumnRefs(raw.columns);
    if (!columns) return null;
    out.columns = columns;
  }
  if (raw.cells !== undefined) {
    if (!Array.isArray(raw.cells) || raw.cells.length > MAX_MATCH_VALUES) return null;
    out.cells = [];
    for (const c of raw.cells) {
      if (!isObj(c) || !isObj(c.row)) return null;
      const column = parseColumnRef(c.column);
      const rowColumn = parseColumnRef(c.row.column);
      if (!column || !rowColumn || !isCellValue(c.row.value)) return null;
      out.cells.push({ column, row: { column: rowColumn, value: c.row.value } });
    }
  }
  if (raw.sum !== undefined) {
    if (raw.sum === true) out.sum = true;
    else {
      const sum = parseColumnRefs(raw.sum);
      if (!sum) return null;
      out.sum = sum;
    }
  }
  return out;
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
  if (raw.colorBy !== undefined) {
    const column = raw.colorBy === null ? null : parseColumnRef(raw.colorBy);
    if (raw.colorBy !== null && !column) return null;
    out.colorBy = column;
  }
  if (raw.export !== undefined) {
    if (typeof raw.export !== 'string' || !EXPORT_FORMATS.has(raw.export)) return null;
    out.export = raw.export as AimListExportFormat;
  }
  if (raw.visibleOnly !== undefined) {
    if (typeof raw.visibleOnly !== 'boolean') return null;
    out.visibleOnly = raw.visibleOnly;
  }
  if (raw.columnWidths !== undefined) {
    const widths = parseColumnWidths(raw.columnWidths);
    if (!widths) return null;
    out.columnWidths = widths;
  }
  if (raw.highlight !== undefined) {
    const highlight = raw.highlight === null ? null : parseHighlight(raw.highlight);
    if (raw.highlight !== null && !highlight) return null;
    out.highlight = highlight;
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

/** Podlažie a model sa pri úprave prepínajú: nové pravidlo nahradí staré toho druhu (krok 2). */
const SWITCH_KINDS = new Set(['storey', 'model']);

/**
 * Pridá filtre (AND) k filtrom zoznamu. Skupiny zoznamu sa medzi sebou spájajú ako OR,
 * preto sa nové pravidlá pridajú do každej skupiny; skupina OR s viac pravidlami sa
 * bez vnorenia zúžiť nedá (`null`). Zoznam bez filtrov dostane nové skupiny. Nové
 * podlažie alebo model nahradí doterajšie pravidlo toho druhu (AND dvoch podlaží je prázdny).
 */
export function andGroups(existing: readonly FilterGroup[], added: readonly FilterGroup[]): FilterGroup[] | null {
  const rules = added.flatMap((g) => (g.combinator === 'AND' || g.rules.length === 1 ? g.rules : []));
  if (rules.length !== added.reduce((n, g) => n + g.rules.length, 0)) return null;
  if (rules.length === 0) return [...existing];
  const switched = new Set(rules.filter((r) => SWITCH_KINDS.has(r.kind)).map((r) => r.kind));
  const live = existing.filter((g) => g.rules.length > 0);
  if (live.length === 0) return [{ combinator: 'AND', rules }];
  const out: FilterGroup[] = [];
  for (const g of live) {
    const kept = g.rules.filter((r) => !switched.has(r.kind));
    if (g.combinator === 'OR' && kept.length > 1) return null;
    out.push({ combinator: 'AND', rules: [...kept, ...rules] });
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
    sums: { columnId: string; value: number; unit?: string }[];
    visibleOnly?: boolean; widths?: { columnId: string; width: number }[];
    highlight?: { rows: number; cells: number; columnIds: string[]; sum: string[] } | null } | null;
  maximized: boolean;
  /** Stĺpec, podľa ktorého sú prvky v 3D ofarbené (id), a formát ponúknutý na stiahnutie. */
  colorBy?: string | null;
  exportReady?: AimListExportFormat | null;
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
    ...(s.colorBy ? { color_by: label(s.colorBy) } : {}),
    ...(s.table?.visibleOnly !== undefined ? { visible_only: s.table.visibleOnly } : {}),
    ...(s.table?.widths ? { column_widths: s.table.widths.map((w) => ({ column: label(w.columnId), px: Math.round(w.width) })) } : {}),
    ...(s.table?.highlight ? { highlight: {
      rows: s.table.highlight.rows, cells: s.table.highlight.cells,
      columns: s.table.highlight.columnIds.map(label), sum: s.table.highlight.sum.map(label),
    } } : {}),
    // Stiahnutie bez kliku prehliadač v iframe nepustí (D-111): tlačidlo čaká na používateľa.
    ...(s.exportReady ? { export_ready: s.exportReady } : {}),
  };
}
