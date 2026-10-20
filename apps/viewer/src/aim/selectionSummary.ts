/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Súhrn výberu pre `QUERY view_state` (AIM D-093): počty podľa IFC triedy,
 * podlažia, rodičovskej zostavy a modelu nad CELÝM výberom a orezaný zoznam
 * GUID a položiek. Odpoveď ide cez Supabase Realtime (strop 256 kB na správu,
 * 100 kB/s), preto celý zoznam s identitou neposielame: súhrn je malý vždy,
 * zoznamy majú pevný strop. Čistá funkcia, údaje o prvku dodá volajúci.
 */

/** Strop GUID v odpovedi (~25 kB). */
export const MAX_SELECTION_GUIDS = 1000;
/** Strop položiek s identitou v odpovedi (~25 kB). */
export const MAX_SELECTION_ITEMS = 100;
/** Koľko skupín na rozmer súhrnu; zvyšok sa zráta do `(ostatné)`. */
export const MAX_SUMMARY_GROUPS = 30;

/** Čo viewer vie o vybranom prvku (z načítaného IFC). */
export interface SelectedEntityInfo {
  guid: string | null;
  name: string | null;
  ifc_type: string | null;
  storey: string | null;
  model: string | null;
  parent: { guid: string | null; ifc_type: string | null; name: string | null } | null;
}

export interface SummaryGroup { key: string; count: number }
export interface ParentGroup extends SummaryGroup { guid: string | null; ifc_type: string | null; name: string | null }

export interface SelectionItem {
  guid: string;
  name: string | null;
  ifc_type: string | null;
  storey: string | null;
  model?: string;
  parent_guid?: string;
  parent_type?: string;
  parent_name?: string;
}

export interface ViewerSelectionReply {
  count: number;
  guids: string[];
  items: SelectionItem[];
  truncated: boolean;
  summary: {
    of: number;
    by_ifc_type: SummaryGroup[];
    by_storey: SummaryGroup[];
    by_parent: ParentGroup[];
    by_model?: SummaryGroup[];
  };
}

const UNKNOWN = '(neznáme)';
const NO_PARENT = '(bez zostavy)';
const OTHER = '(ostatné)';

function byCount<T extends SummaryGroup>(groups: Iterable<T>): T[] {
  return [...groups].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function capGroups<T extends SummaryGroup>(sorted: T[], other: (count: number) => T): T[] {
  if (sorted.length <= MAX_SUMMARY_GROUPS) return sorted;
  const rest = sorted.slice(MAX_SUMMARY_GROUPS - 1).reduce((s, g) => s + g.count, 0);
  return [...sorted.slice(0, MAX_SUMMARY_GROUPS - 1), other(rest)];
}

function group(values: Iterable<string | null>): SummaryGroup[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v || UNKNOWN;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return capGroups(byCount([...counts].map(([key, count]) => ({ key, count }))), (count) => ({ key: OTHER, count }));
}

function parentKey(p: SelectedEntityInfo['parent']): string {
  if (!p) return NO_PARENT;
  const id = p.name || p.guid;
  if (!id) return p.ifc_type || UNKNOWN;
  return p.ifc_type ? `${p.ifc_type} ${id}` : id;
}

function groupParents(infos: readonly SelectedEntityInfo[]): ParentGroup[] {
  const groups = new Map<string, ParentGroup>();
  for (const { parent } of infos) {
    const key = parent?.guid ? `#${parent.guid}` : parentKey(parent);
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { key: parentKey(parent), count: 1, guid: parent?.guid ?? null, ifc_type: parent?.ifc_type ?? null, name: parent?.name ?? null });
  }
  return capGroups(byCount(groups.values()), (count) => ({ key: OTHER, count, guid: null, ifc_type: null, name: null }));
}

function toItem(info: SelectedEntityInfo & { guid: string }, withModel: boolean): SelectionItem {
  const p = info.parent;
  return {
    guid: info.guid, name: info.name, ifc_type: info.ifc_type, storey: info.storey,
    ...(withModel && info.model ? { model: info.model } : {}),
    ...(p?.guid ? { parent_guid: p.guid } : {}),
    ...(p?.ifc_type ? { parent_type: p.ifc_type } : {}),
    ...(p?.name ? { parent_name: p.name } : {}),
  };
}

/**
 * `infos` = celý výber v poradí viewera. Súhrn je nad všetkými prvkami (aj bez
 * GUID), zoznamy len do stropov; `truncated` = zoznam GUID nie je celý.
 */
export function summarizeSelection(infos: readonly SelectedEntityInfo[]): ViewerSelectionReply {
  const withGuid = infos.filter((i): i is SelectedEntityInfo & { guid: string } => !!i.guid);
  const models = new Set(infos.map((i) => i.model ?? ''));
  const multiModel = models.size > 1;
  const guids = withGuid.slice(0, MAX_SELECTION_GUIDS).map((i) => i.guid);
  return {
    count: infos.length,
    guids,
    items: withGuid.slice(0, MAX_SELECTION_ITEMS).map((i) => toItem(i, multiModel)),
    truncated: guids.length < infos.length,
    summary: {
      of: infos.length,
      by_ifc_type: group(infos.map((i) => i.ifc_type)),
      by_storey: group(infos.map((i) => i.storey)),
      by_parent: groupParents(infos),
      ...(multiModel ? { by_model: group(infos.map((i) => i.model)) } : {}),
    },
  };
}

/**
 * Strop GUID skrytých a izolovaných prvkov v `view_state` (AIM D-117): rovnaký
 * ako HIDE/ISOLATE v moste, takže uložený pohľad sa vráti jednou správou.
 */
export const MAX_VISIBILITY_GUIDS = 600;

/** GUIDy prvkov kanála viditeľnosti do stropu, bez duplicít; prvok bez GUID sa preskočí. */
export function visibilityGuids(
  ids: Iterable<number>,
  guidOf: (id: number) => string | null | undefined,
  max = MAX_VISIBILITY_GUIDS,
): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    if (out.size >= max) break;
    const guid = guidOf(id);
    if (guid) out.add(guid);
  }
  return [...out];
}
