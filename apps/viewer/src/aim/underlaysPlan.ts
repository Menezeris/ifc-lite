/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Jednotlivé PDF podklady v 3D (AIM #323) a ich stav v uloženom pohľade (AIM #325). Čisté funkcie bez
 * store. Prepis (`UnderlayOverride`) je stav viewera nad uloženou kalibráciou: zapne alebo vypne jeden
 * podklad v 3D a zmení jeho priehľadnosť bez zápisu do `_georef` (poloha kalibrácie sa nedotkne).
 * Kľúčom prepisu je id záznamu store; na drôte je `document_id` skutočné id dokumentu (`documentId`).
 * Rez s viacerými kalibráciami (AIM #284) má viac záznamov jedného dokumentu: položka drôtu platí pre všetky.
 */

export interface UnderlayOverride {
  visible?: boolean;
  opacity?: number;
}
export type UnderlayOverrides = Readonly<Record<string, UnderlayOverride>>;

/** Položka správy `SET_UNDERLAYS_3D.underlays`: podklad podľa `document_id`, chýbajúce pole sa nemení. */
export interface UnderlayItemWire {
  document_id: string;
  visible?: boolean;
  opacity?: number;
}

/** Stav podkladov v uloženom pohľade: prepínač 3D a viditeľnosť s priehľadnosťou každého kalibrovaného. */
export interface UnderlaysViewWire {
  show: boolean;
  items: { document_id: string; visible: boolean; opacity: number }[];
}

/** Kalibrovaný výkres, ako ho pozná store (`underlayDrawings` s `placement`). */
export interface CalibratedDrawing {
  id: string;
  /** Id dokumentu na drôte; chýba = `id` (pôdorys, rez s jednou kalibráciou). */
  documentId?: string;
  name: string;
  placement: {
    /** Zvislá rovina rezu (AIM #284); chýba = pôdorys. */
    plane?: unknown;
    visible: boolean;
    opacity: number;
    page: number;
    storeyGuid: string;
    storeyZ: number;
    discipline: string | null;
    calibratedAt: string | null;
  };
}

export const MAX_UNDERLAY_ITEMS = 200;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const isOpacity = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const optional = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || ok(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const docId = (d: CalibratedDrawing) => d.documentId ?? d.id;

/** Záznamy store, ktorých sa týka `document_id` z drôtu (všetky kalibrácie dokumentu, alebo presné id záznamu). */
export function underlayIdsFor(drawings: readonly CalibratedDrawing[], documentId: string): string[] {
  const byDoc = drawings.filter((d) => docId(d) === documentId).map((d) => d.id);
  return byDoc.length > 0 ? byDoc : drawings.filter((d) => d.id === documentId).map((d) => d.id);
}

/** Položky `SET_UNDERLAYS_3D.underlays`: každá s id a aspoň jedným z `visible`, `opacity`. */
export function isUnderlayItems(v: unknown): v is UnderlayItemWire[] {
  return Array.isArray(v) && v.length <= MAX_UNDERLAY_ITEMS && v.every((x) => isObj(x) && isId(x.document_id)
    && (x.visible !== undefined || x.opacity !== undefined) && optional(x.visible, isBool) && optional(x.opacity, isOpacity));
}

export function isUnderlaysViewWire(v: unknown): v is UnderlaysViewWire {
  return isObj(v) && isBool(v.show) && Array.isArray(v.items) && v.items.length <= MAX_UNDERLAY_ITEMS
    && v.items.every((x) => isObj(x) && isId(x.document_id) && isBool(x.visible) && isOpacity(x.opacity));
}

/** Placement pre renderer: prepis podkladu, potom globálne skrytie; store ostáva nedotknutý (kópia). */
export function underlayIn3d<T extends { visible: boolean; opacity: number }>(placement: T, override: UnderlayOverride | undefined, hideAll: boolean): T {
  const visible = !hideAll && (override?.visible ?? placement.visible);
  const opacity = override?.opacity ?? placement.opacity;
  return visible === placement.visible && opacity === placement.opacity ? placement : { ...placement, visible, opacity };
}

/**
 * Nové prepisy po `SET_UNDERLAYS_3D`: položky sa zlúčia s doterajšími, `only` vypne v 3D všetky ostatné
 * kalibrované podklady. `unknown` = id, ktoré viewer medzi kalibrovanými nemá (host to dostane ako problém).
 */
export function planUnderlaySet(
  drawings: readonly CalibratedDrawing[], current: UnderlayOverrides, items: readonly UnderlayItemWire[], only: boolean,
): { overrides: Record<string, UnderlayOverride>; unknown: string[] } {
  const next: Record<string, UnderlayOverride> = { ...current };
  const unknown: string[] = [];
  const named = new Set<string>();
  for (const it of items) {
    const ids = underlayIdsFor(drawings, it.document_id);
    if (ids.length === 0) { unknown.push(it.document_id); continue; }
    for (const id of ids) {
      named.add(id);
      next[id] = {
        ...next[id],
        ...(it.visible !== undefined ? { visible: it.visible } : {}),
        ...(it.opacity !== undefined ? { opacity: it.opacity } : {}),
      };
    }
  }
  if (only) for (const d of drawings) if (!named.has(d.id)) next[d.id] = { ...next[d.id], visible: false };
  return { overrides: next, unknown };
}

/** Kalibrované podklady pre `get_viewer_state.underlays`: účinná viditeľnosť a priehľadnosť v 3D aj uložené hodnoty. */
export function describeUnderlays(drawings: readonly CalibratedDrawing[], overrides: UnderlayOverrides) {
  return drawings.slice(0, MAX_UNDERLAY_ITEMS).map((d) => {
    const o = overrides[d.id];
    const p = d.placement;
    return {
      document_id: docId(d),
      name: d.name,
      page: p.page,
      kind: p.plane ? 'section' as const : 'plan' as const,
      storey_guid: p.storeyGuid || null,
      storey_z: p.storeyZ,
      discipline: p.discipline,
      calibrated_at: p.calibratedAt,
      visible: o?.visible ?? p.visible,
      opacity: o?.opacity ?? p.opacity,
      saved: { visible: p.visible, opacity: p.opacity },
      overridden: o !== undefined && (o.visible !== undefined || o.opacity !== undefined),
    };
  });
}

/** Stav podkladov do uloženého pohľadu: každý kalibrovaný s účinnou viditeľnosťou a priehľadnosťou. */
export function snapshotUnderlays(drawings: readonly CalibratedDrawing[], overrides: UnderlayOverrides, shown: boolean): UnderlaysViewWire {
  // Jedna položka na dokument: kalibrácie jedného rezu sa zapínajú spolu (stav prvej).
  const seen = new Set<string>();
  const items: UnderlaysViewWire['items'] = [];
  for (const d of drawings) {
    if (seen.has(docId(d)) || items.length >= MAX_UNDERLAY_ITEMS) continue;
    seen.add(docId(d));
    items.push({
      document_id: docId(d),
      visible: overrides[d.id]?.visible ?? d.placement.visible,
      opacity: overrides[d.id]?.opacity ?? d.placement.opacity,
    });
  }
  return { show: shown, items };
}

/** Obnova z pohľadu: prepisy sa nahradia celé, podklad kalibrovaný až po uložení pohľadu ostane podľa kalibrácie. */
export function restoreUnderlays(w: UnderlaysViewWire, drawings: readonly CalibratedDrawing[] = []): { shown: boolean; overrides: Record<string, UnderlayOverride> } {
  const overrides: Record<string, UnderlayOverride> = {};
  for (const it of w.items) {
    const ids = underlayIdsFor(drawings, it.document_id);
    for (const id of ids.length > 0 ? ids : [it.document_id]) overrides[id] = { visible: it.visible, opacity: it.opacity };
  }
  return { shown: w.show, overrides };
}

/** Kalibrované výkresy zo store (`underlayDrawings`) v poradí vloženia. */
export function calibratedDrawings(
  map: ReadonlyMap<string, { id: string; name: string; placement: CalibratedDrawing['placement'] | null }>,
  documentOf: (id: string) => string = (id) => id,
): CalibratedDrawing[] {
  const out: CalibratedDrawing[] = [];
  for (const d of map.values()) {
    if (!d.placement) continue;
    const doc = documentOf(d.id);
    out.push({ id: d.id, ...(doc !== d.id ? { documentId: doc } : {}), name: d.name, placement: d.placement });
  }
  return out;
}
