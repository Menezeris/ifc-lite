/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zoznam z chatu (AIM D-111): validácia správy `OPEN_LIST` a jej preklad na
 * upstream `ListDefinition`. Filtre sú tie isté `FilterGroup` ako pravidlá Lens
 * z chatu (D-096), modely sa prekladajú rovnako (`resolveModelRules`). Store sa
 * tu nečíta; lepidlo je v `aimList.ts`.
 */

import { isFilterGroup, type FilterGroup } from '@ifc-lite/rules';
import type { ColumnDefinition, ListDefinition } from '@ifc-lite/lists';
import type { LensInboundMessage } from './lens-protocol.js';
import { MAX_AIM_GLOBAL_IDS, resolveModelRules, type ModelRef } from './aimLensPlan.js';
import { parseListView } from './aimListViewPlan.js';
import { isHostValues } from './aimHostColumns.js';

export type OpenListMessage = Extract<LensInboundMessage, { type: 'OPEN_LIST' }>;

const MAX_GROUPS = 8;
const MAX_COLUMNS = 40;
const SOURCES = new Set<ColumnDefinition['source']>([
  'attribute', 'property', 'quantity', 'material', 'classification', 'spatial', 'model', 'zone', 'geometry', 'host',
]);
/** Zdroje, pri ktorých `psetName` nesie meno sady (pset / qset / zónová sada). */
const NEEDS_SET = new Set<ColumnDefinition['source']>(['property', 'quantity']);

const shortStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Plná validácia správy z hosta; `null` = zahodiť (nič sa neotvorí). */
export function parseOpenList(data: LensInboundMessage): OpenListMessage | null {
  const m = data as unknown as Record<string, unknown>;
  if (m.type !== 'OPEN_LIST' || !shortStr(m.name, 120)) return null;
  if (m.run !== undefined && typeof m.run !== 'boolean') return null;
  if (parseListView(m.view) === null) return null;
  if (!Array.isArray(m.groups) || m.groups.length === 0 || m.groups.length > MAX_GROUPS || !m.groups.every(isFilterGroup)) return null;
  let ids = 0;
  for (const g of m.groups as FilterGroup[]) for (const r of g.rules) if (r.kind === 'globalId') ids += r.values.length;
  if (ids > MAX_AIM_GLOBAL_IDS) return null;
  if (!Array.isArray(m.columns) || m.columns.length === 0 || m.columns.length > MAX_COLUMNS) return null;
  for (const c of m.columns as Record<string, unknown>[]) {
    if (!c || typeof c !== 'object' || !SOURCES.has(c.source as ColumnDefinition['source'])) return null;
    if (typeof c.propertyName !== 'string' || c.propertyName.length > 200) return null;
    if (c.psetName !== undefined && !shortStr(c.psetName, 200)) return null;
    if (NEEDS_SET.has(c.source as ColumnDefinition['source']) && c.psetName === undefined) return null;
    if (c.label !== undefined && !shortStr(c.label, 120)) return null;
    // Príznak AIM_VIEWER_HOST_COLUMNS je len na hostovi (AIMviewer): rozhoduje, či host stĺpce `host` vôbec pošle.
    // Viewer ho nečíta a správu so stĺpcom `host` prijme vždy, preto tu nie je žiadna podmienka podľa príznaku.
    // Stĺpec od hosta (D-174): kľúč a hodnoty podľa GlobalId, bez sady; ostatné zdroje hodnoty nenesú.
    if (c.source === 'host') {
      if (!shortStr(c.propertyName, 200) || c.psetName !== undefined || !isHostValues(c.values)) return null;
    } else if (c.values !== undefined) return null;
  }
  return data as OpenListMessage;
}

/** `ListDefinition` pre builder panela Lists: všetky prvky modelov zúžené filtrami správy. */
export function listDefinitionFromChat(msg: OpenListMessage, models: readonly ModelRef[], id: string, now: number): ListDefinition {
  const columns: ColumnDefinition[] = msg.columns.map((c, i) => ({
    id: `col-${i}`,
    source: c.source,
    propertyName: c.propertyName,
    ...(c.psetName ? { psetName: c.psetName } : {}),
    ...(c.label ? { label: c.label } : {}),
  }));
  return {
    id,
    name: msg.name,
    createdAt: now,
    updatedAt: now,
    // Bez triedy = každý prvok modelu; triedu, podlažie a ostatné nesú filtre.
    entityTypes: [],
    groups: resolveModelRules(msg.groups as FilterGroup[], models),
    columns,
  };
}
