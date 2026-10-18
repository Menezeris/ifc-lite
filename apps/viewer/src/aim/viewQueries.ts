/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čítanie stavu viewera pre spätný kanál (AIM D-085) a pre rez cez prvok.
 * Len existujúce cesty viewera: obálky zo scény renderera (tie isté ako pri
 * rámovaní kamery, aj po uvoľnení mesh polí a pre inštancie), geometricky
 * prázdne zostavy (IfcStair ako kontajner) cez ich časti, rámec IFC sveta
 * cez `bcfWorldOffset` (rovnaké pravidlo ako BCF a meranie).
 */

import { useViewerStore } from '@/store';
import { toGlobalIdFromModels } from '@/store/globalId';
import { resolveEntityRef } from '@/store/resolveEntityRef';
import { activeSectionPlane } from '@/store/section-active';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { bcfWorldOffset } from '@/hooks/bcf/viewpoint-world-frame';
import { mergedSectionBounds, percentToWorld, sectionAxisRange } from '@/lib/section/section-distance';
import { expandToGeometryBearingIds } from '@/utils/aggregation';
import { guidForEntity, resolveGuids } from './bridge-protocol.js';
import type { SectionPlaneAxis } from '@/store/types';
import type { SectionAxis, SectionFit } from './view-protocol.js';
import {
  VIEWER_AXIS, cutPercent, hostAxis, ifcCoordinateToRender, renderBoxToIfc, renderPointToIfc, sectionThroughBox,
  unionBoxes, type Box3, type Vec3,
} from './viewCommands.js';

type State = ReturnType<typeof useViewerStore.getState>;

/** Výsledok zaokrúhlený na milimetre - Claude ho číta, nie renderer. */
const mm = (v: number) => Math.round(v * 1000) / 1000;
const roundVec = (v: Vec3): Vec3 => ({ x: mm(v.x), y: mm(v.y), z: mm(v.z) });
function describeBox(box: Box3) {
  return {
    min: roundVec(box.min),
    max: roundVec(box.max),
    size: roundVec({ x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z }),
    center: roundVec({ x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 }),
  };
}

/** Os rezu hosta -> os IFC sveta, ktorú rovina pretína. */
export const SECTION_AXIS_IN_IFC = { x: 'IFC X', y: 'IFC Z (výška)', z: 'IFC Y' } as const;

export const worldOffset = (state: State): Vec3 => bcfWorldOffset(state.models, state.geometryResult);
export const sectionBounds = (state: State) => mergedSectionBounds(state.models, state.geometryResult);

/** Render-rámcová obálka jedného prvku podľa GUID (zostava bez geometrie = jej časti). */
function renderBoundsOfGuid(state: State, guid: string): Box3 | null {
  const scene = getGlobalRenderer()?.getScene();
  if (!scene) return null;
  const boxOf = (id: number): Box3 | null => scene.getEntityBoundingBox(id) ?? scene.getInstancedEntityBounds(id) ?? null;
  const ids = resolveGuids(state.models, [guid]).map((r) => toGlobalIdFromModels(state.models, r.modelId, r.expressId));
  if (ids.length === 0) return null;
  const parts = expandToGeometryBearingIds(ids, (id) => boxOf(id) !== null, {
    resolve: resolveEntityRef,
    relationshipsFor: (modelId) => state.models.get(modelId)?.ifcDataStore?.relationships,
    toGlobalId: (modelId, expressId) => toGlobalIdFromModels(state.models, modelId, expressId),
  });
  return unionBoxes(parts.map(boxOf).filter((b): b is Box3 => b !== null));
}

/** Zjednotená render-rámcová obálka GUIDov a zoznam tých, ktoré nemajú geometriu. */
export function renderBoundsOfGuids(state: State, guids: readonly string[]) {
  const found: { guid: string; box: Box3 }[] = [];
  const missing: string[] = [];
  for (const guid of guids) {
    const box = renderBoundsOfGuid(state, guid);
    if (box) found.push({ guid, box });
    else missing.push(guid);
  }
  return { found, missing, union: unionBoxes(found.map((f) => f.box)) };
}

/** `QUERY bounds`: obálka modelu a (voliteľne) prvkov v IFC svete. */
export function queryBounds(state: State, guids: readonly string[]) {
  const offset = worldOffset(state);
  const model = sectionBounds(state);
  const { found, missing, union } = renderBoundsOfGuids(state, guids);
  return {
    frame: 'ifc_world', units: 'm', axes: { x: 'IFC X', y: 'IFC Y', z: 'IFC Z (hore)' },
    section_axis: SECTION_AXIS_IN_IFC,
    model: model ? describeBox(renderBoxToIfc(model, offset)) : null,
    elements: found.map((f) => ({ guid: f.guid, ...describeBox(renderBoxToIfc(f.box, offset)) })),
    ...(found.length > 1 && union ? { union: describeBox(renderBoxToIfc(union, offset)) } : {}),
    missing,
  };
}

const MAX_SELECTION = 50;

/** `QUERY view_state`: rez, kamera, režim, výber a viditeľnosť. */
export function queryViewState(state: State, view: { mode: string; storeyGuid?: string | null }) {
  const offset = worldOffset(state);
  const plane = activeSectionPlane(state);
  const range = plane ? sectionAxisRange(sectionBounds(state), plane.axis) : null;
  let section: Record<string, unknown> | null = null;
  if (plane) {
    const axis = hostAxis(plane.axis);
    // Os hosta je zároveň kľúč osi v render rámci (`sectionAxisKey`).
    const point = { x: 0, y: 0, z: 0 };
    if (range) point[axis] = percentToWorld(plane.position, range);
    const ifc = renderPointToIfc(point, offset);
    const coord = axis === 'x' ? ifc.x : axis === 'y' ? ifc.z : ifc.y;
    section = { axis, crosses: SECTION_AXIS_IN_IFC[axis], position_percent: mm(plane.position), ...(range ? { coordinate: mm(coord) } : {}), flipped: plane.flipped };
  }
  const camera = getGlobalRenderer()?.getCamera();
  const selected = state.selectedEntityIds.size > 0
    ? [...state.selectedEntityIds]
    : state.selectedEntityId !== null ? [state.selectedEntityId] : [];
  const guids = selected.slice(0, MAX_SELECTION)
    .map((id) => guidForEntity(state.models, resolveEntityRef(id)))
    .filter((g): g is string => !!g);
  return {
    frame: 'ifc_world', units: 'm',
    mode: view.mode, storey_guid: view.storeyGuid ?? null,
    section,
    camera: camera
      ? { position: roundVec(renderPointToIfc(camera.getPosition(), offset)), target: roundVec(renderPointToIfc(camera.getTarget(), offset)), projection: state.projectionMode }
      : null,
    selection: { count: selected.length, guids },
    hidden_count: state.hiddenEntities.size,
    isolated_count: state.isolatedEntities ? state.isolatedEntities.size : null,
  };
}

/**
 * Rez cez obálku prvkov alebo na súradnici IFC sveta -> os a poloha pre
 * `showSectionCut`. null = prvky ešte nemajú geometriu v scéne (volajúci
 * skúsi znova) alebo chýba os či rozsah modelu.
 */
export function sectionCutFor(
  state: State,
  msg: { guids?: string[]; fit?: SectionFit; axis?: SectionAxis; coordinate?: number },
): { axis: SectionPlaneAxis; position: number } | null {
  let target: { axis: SectionAxis; world: number } | null = null;
  if (msg.guids?.length) {
    const box = renderBoundsOfGuids(state, msg.guids).union;
    target = box ? sectionThroughBox(box, msg.fit ?? 'center', msg.axis) : null;
  } else if (msg.axis && msg.coordinate !== undefined) {
    target = { axis: msg.axis, world: ifcCoordinateToRender(msg.axis, msg.coordinate, worldOffset(state)) };
  }
  if (!target) return null;
  const axis = VIEWER_AXIS[target.axis];
  const position = cutPercent(target.world, sectionAxisRange(sectionBounds(state), axis));
  return position === null ? null : { axis, position };
}
