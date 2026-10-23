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
import { showSectionCut } from '@/store/section-active';
import { toGlobalIdFromModels } from '@/store/globalId';
import { resolveEntityRef } from '@/store/resolveEntityRef';
import { activeSectionPlane } from '@/store/section-active';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { bcfWorldOffset } from '@/hooks/bcf/viewpoint-world-frame';
import { percentToWorld, sectionAxisRange } from '@/lib/section/section-distance';
import type { AxisBounds } from '@/lib/section/section-distance';
import { expandToGeometryBearingIds } from '@/utils/aggregation';
import { deriveViewMode } from '@/hooks/viewModeCore';
import { RelationshipType } from '@ifc-lite/data';
import { summarizeSelection, visibilityGuids, type SelectedEntityInfo } from './selectionSummary.js';
import { describePanels } from './aimPanelsPlan.js';
import { panelViewState } from './aimPanelScroll.js';
import { useAimInspectorStore } from './aimInspectorStore.js';
import { useAimDocRegionStore } from './docRegion.js';
import { useAimUnderlays3d } from './aimUnderlays3d.js';
import { useAimViewTabs } from './viewTabsStore.js';
import { describeTabs } from './viewTabsPlan.js';
import { describeLayout } from './viewTilesPlan.js';
import { orderedBox, toSectionBox, type SectionBoxMessage } from './sectionBox.js';
import type { guidForEntity, resolveGuids } from './bridge-protocol.js';
import type { SectionPlaneAxis } from '@/store/types';
import type { SectionAxis, SectionFit, ViewInboundMessage, ViewQueryResult } from './view-protocol.js';
import { describeList } from './aimListState.js';
import {
  cutPercent, hostAxis, viewerAxis, ifcCoordinateToRender, ifcPointToRender, renderBoxToIfc, renderDirToIfc, renderPointToIfc, sectionThroughBox, unionBoxes,
  type Box3, type Vec3,
} from './viewFrame.js';

type State = ReturnType<typeof useViewerStore.getState>;

/**
 * GUID <-> prvok z `bridge-protocol.ts` a obálka rezu z `sectionRange.ts`,
 * odovzdané volajúcim: priamy import by tie moduly vytrhol zo vstupného
 * balíka do zdieľaného chunku (perf ratchet).
 */
export interface GuidHelpers {
  resolveGuids: typeof resolveGuids;
  guidForEntity: typeof guidForEntity;
  sectionRenderBounds: (state: State) => AxisBounds | null;
  /** Zvýraznenie z FOCUS (D-101, #94); podáva ho AimBridge, lenivý modul ho neimportuje. */
  focus?: () => { count: number; guids: string[] };
  /** Zmeny pohľadu od posledného potvrdeného príkazu (D-125, #180); podáva ich AimBridge. */
  changes?: () => string[];
}

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

/** Render-rámcová obálka prvkov viewera (globálne id; zostava bez geometrie = jej časti). */
export function renderBoundsOfIds(state: State, ids: readonly number[]): Box3 | null {
  const scene = getGlobalRenderer()?.getScene();
  if (!scene || ids.length === 0) return null;
  const boxOf = (id: number): Box3 | null => scene.getEntityBoundingBox(id) ?? scene.getInstancedEntityBounds(id) ?? null;
  const parts = expandToGeometryBearingIds([...ids], (id) => boxOf(id) !== null, {
    resolve: resolveEntityRef,
    relationshipsFor: (modelId) => state.models.get(modelId)?.ifcDataStore?.relationships,
    toGlobalId: (modelId, expressId) => toGlobalIdFromModels(state.models, modelId, expressId),
  });
  return unionBoxes(parts.map(boxOf).filter((b): b is Box3 => b !== null));
}

/** Render-rámcová obálka jedného prvku podľa GUID. */
function renderBoundsOfGuid(state: State, guid: string, g: GuidHelpers): Box3 | null {
  const ids = g.resolveGuids(state.models, [guid]).map((r) => toGlobalIdFromModels(state.models, r.modelId, r.expressId));
  return renderBoundsOfIds(state, ids);
}

/** Zjednotená render-rámcová obálka GUIDov a zoznam tých, ktoré nemajú geometriu. */
export function renderBoundsOfGuids(state: State, guids: readonly string[], g: GuidHelpers) {
  const found: { guid: string; box: Box3 }[] = [];
  const missing: string[] = [];
  for (const guid of guids) {
    const box = renderBoundsOfGuid(state, guid, g);
    if (box) found.push({ guid, box });
    else missing.push(guid);
  }
  return { found, missing, union: unionBoxes(found.map((f) => f.box)) };
}

/** `QUERY bounds`: obálka modelu a (voliteľne) prvkov v IFC svete. */
export function queryBounds(state: State, guids: readonly string[], g: GuidHelpers) {
  const offset = worldOffset(state);
  // Obálka, voči ktorej renderer reže (#63): rez, spätné čítanie aj obálka modelu z jednej pravdy.
  const model = g.sectionRenderBounds(state);
  const { found, missing, union } = renderBoundsOfGuids(state, guids, g);
  return {
    frame: 'ifc_world', units: 'm', axes: { x: 'IFC X', y: 'IFC Y', z: 'IFC Z (hore)' },
    section_axis: SECTION_AXIS_IN_IFC,
    model: model ? describeBox(renderBoxToIfc(model, offset)) : null,
    elements: found.map((f) => ({ guid: f.guid, ...describeBox(renderBoxToIfc(f.box, offset)) })),
    ...(found.length > 1 && union ? { union: describeBox(renderBoxToIfc(union, offset)) } : {}),
    missing,
  };
}

type RenderCamera = NonNullable<ReturnType<NonNullable<ReturnType<typeof getGlobalRenderer>>['getCamera']>>;
const unit = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: Math.round((v.x / len) * 1e6) / 1e6, y: Math.round((v.y / len) * 1e6) / 1e6, z: Math.round((v.z / len) * 1e6) / 1e6 };
};

/**
 * Póza kamery v IFC svete; `up`, FOV, polovica výšky ortografického pohľadu a
 * pomer strán stačia hostovi na relatívny zoom/orbit/posun (AIM D-098).
 */
function describeCamera(camera: RenderCamera, offset: Vec3, projection: string) {
  const ortho = projection === 'orthographic';
  return {
    position: roundVec(renderPointToIfc(camera.getPosition(), offset)),
    target: roundVec(renderPointToIfc(camera.getTarget(), offset)),
    up: unit(renderDirToIfc(camera.getUp())),
    projection,
    fov_deg: Math.round((camera.getFOV() * 180 / Math.PI) * 1000) / 1000,
    ...(ortho ? { ortho_size: mm(camera.getOrthoSize()) } : {}),
    aspect: Math.round(camera.getAspect() * 1e4) / 1e4,
  };
}

/**
 * Trieda, podlažie (aj pre časť zostavy, `elementToStorey`), rodič cez
 * `IfcRelAggregates` a model vybraného prvku, z načítaného IFC (AIM D-093).
 */
function selectedEntityInfo(state: State, id: number, g: GuidHelpers): SelectedEntityInfo {
  const ref = resolveEntityRef(id);
  const model = state.models.get(ref.modelId);
  const store = model?.ifcDataStore;
  const guid = g.guidForEntity(state.models, ref) ?? null;
  if (!store) return { guid, name: null, ifc_type: null, storey: null, model: model?.name ?? null, parent: null };
  const { entities } = store;
  // @raw-entity-enumeration-ok point lookup of the selected element's storey for a read-only answer to the AIM host
  const storeyId = store.spatialHierarchy?.elementToStorey.get(ref.expressId);
  const parentId = store.relationships?.getRelated(ref.expressId, RelationshipType.Aggregates, 'inverse')[0];
  return {
    guid,
    name: entities.getName(ref.expressId) || null,
    ifc_type: entities.getTypeName(ref.expressId) || null,
    storey: storeyId !== undefined ? entities.getName(storeyId) || `#${storeyId}` : null,
    model: model?.name ?? null,
    parent: parentId !== undefined ? {
      guid: entities.getGlobalId(parentId) || null,
      ifc_type: entities.getTypeName(parentId) || null,
      name: entities.getName(parentId) || null,
    } : null,
  };
}

/** `QUERY view_state`: rez, kamera, režim, výber a viditeľnosť (počty aj GUIDy skrytých a izolovaných). */
export function queryViewState(state: State, g: GuidHelpers) {
  const mode = deriveViewMode({
    splitView: state.underlaySplitView,
    planFull: state.underlayPlanFull,
    viewLocked: state.underlayViewLocked,
  });
  const offset = worldOffset(state);
  const plane = activeSectionPlane(state);
  const range = plane ? sectionAxisRange(g.sectionRenderBounds(state), plane.axis) : null;
  let section: Record<string, unknown> | null = null;
  if (plane) {
    const axis = hostAxis(plane.axis);
    // Os hosta je zároveň kľúč osi v render rámci (`sectionAxisKey`).
    const point = { x: 0, y: 0, z: 0 };
    if (range) point[axis] = percentToWorld(plane.position, range);
    const ifc = renderPointToIfc(point, offset);
    const coord = axis === 'x' ? ifc.x : axis === 'y' ? ifc.z : ifc.y;
    section = { axis, crosses: SECTION_AXIS_IN_IFC[axis], position_percent: mm(plane.position), ...(range ? { coordinate: mm(coord) } : {}), flipped: plane.flipped, show_gizmo: plane.showGizmo };
    // Rezný box (AIM D-132): obálka v IFC svete namiesto roviny.
    if (plane.box) {
      const [a, b] = [plane.box.min, plane.box.max].map(([x, y, z]) => renderPointToIfc({ x, y, z }, offset));
      const box = orderedBox(a, b);
      section = { box: { min: roundVec(box.min), max: roundVec(box.max) }, show_gizmo: plane.showGizmo };
    }
  }
  const camera = getGlobalRenderer()?.getCamera();
  const selected = state.selectedEntityIds.size > 0
    ? [...state.selectedEntityIds]
    : state.selectedEntityId !== null ? [state.selectedEntityId] : [];
  const bbox = renderBoundsOfIds(state, selected);
  const guidOf = (id: number) => g.guidForEntity(state.models, resolveEntityRef(id));
  return {
    frame: 'ifc_world', units: 'm',
    mode, storey_guid: state.underlayActiveStoreyGuid ?? state.underlayLastStoreyGuid ?? null,
    section,
    camera: camera ? describeCamera(camera, offset, state.projectionMode) : null,
    selection: { ...summarizeSelection(selected.map((id) => selectedEntityInfo(state, id, g))), ...(bbox ? { bbox: describeBox(renderBoxToIfc(bbox, offset)) } : {}) },
    hidden_count: state.hiddenEntities.size,
    isolated_count: state.isolatedEntities ? state.isolatedEntities.size : null,
    // GUIDy do stropu mosta: host z nich uloží a obnoví pohľad (AIM D-122); APPLIED ich nenesie.
    hidden_guids: visibilityGuids(state.hiddenEntities, guidOf),
    isolated_guids: state.isolatedEntities ? visibilityGuids(state.isolatedEntities, guidOf) : null,
    // Oranžové zvýraznenie z FOCUS (#94): bez neho sa nedalo povedať, čo je to za farbu.
    ...(g.focus ? { focus: g.focus() } : {}),
    // Čo sa zmenilo mimo príkazov od posledného potvrdeného (napr. izoláciu vypol používateľ, D-125).
    ...(g.changes ? { changed_since_last_command: g.changes() } : {}),
    // AIM D-127: panely (#179), zvýraznená vlastnosť v paneli (#168) a viditeľný výrez karty dokumentu (#166).
    panels: describePanels(state),
    // AIM D-150: kam chat posunul alebo priblížil obsah panela (lenivý modul, kým sa nepoužil, nie je čo hlásiť).
    panel_view: panelViewState(),
    // AIM D-133 doplnok (#170): podklady PDF v 3D zobrazené (true) alebo skryté (false); stav viewera.
    underlays_3d: !useAimUnderlays3d.getState().hidden,
    property_focus: useAimInspectorStore.getState().propertyFocus,
    document: useAimDocRegionStore.getState().visible,
    // AIM D-132: záložky (aktívna a tá vedľa).
    tabs: describeTabs(useAimViewTabs.getState()),
    // AIM D-149: zoznam v paneli Lists (stĺpce, filtre, zoradenie, zoskupenie, súčty, maximalizácia).
    list: describeList(),
    // AIM D-157: dlaždice (rozloženie, záložka v každej dlaždici, živá 3D).
    layout: tilesLayout(),
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
  g: GuidHelpers,
): { axis: SectionPlaneAxis; position: number } | null {
  let target: { axis: SectionAxis; world: number } | null = null;
  if (msg.guids?.length) {
    const box = renderBoundsOfGuids(state, msg.guids, g).union;
    target = box ? sectionThroughBox(box, msg.fit ?? 'center', msg.axis) : null;
  } else if (msg.axis && msg.coordinate !== undefined) {
    target = { axis: msg.axis, world: ifcCoordinateToRender(msg.axis, msg.coordinate, worldOffset(state)) };
  }
  if (!target) return null;
  const axis = viewerAxis(target.axis);
  const position = cutPercent(target.world, sectionAxisRange(g.sectionRenderBounds(state), axis));
  return position === null ? null : { axis, position };
}

/**
 * Rez cez prvok z deep linku príde s MODELS_LOADED, keď sú modely naparsované,
 * ale geometria ešte len prúdi do scény - obálka prvku vtedy chýba. Skúša sa
 * znova, kým nepríde, alebo kým `isCurrent` nepovie, že prišiel novší rez.
 */
const SECTION_RETRY_MS = 500;
const SECTION_RETRIES = 60;

type TargetSection = Extract<ViewInboundMessage, { type: 'SET_SECTION' }>;

/** Rez cez prvok; Promise skončí, keď je rez hotový, prekonaný novším, alebo sa vzdá (false). */
export function cutThroughTarget(msg: TargetSection, isCurrent: () => boolean, g: GuidHelpers, after?: () => void, attempt = 0): Promise<boolean> {
  if (!isCurrent()) return Promise.resolve(true);
  const cut = sectionCutFor(useViewerStore.getState(), msg, g);
  if (cut) {
    showSectionCut(useViewerStore.getState, { ...cut, flipped: msg.flipped === true });
    after?.();
    return Promise.resolve(true);
  }
  if (msg.guids?.length && attempt < SECTION_RETRIES) {
    return new Promise((r) => setTimeout(r, SECTION_RETRY_MS)).then(() => cutThroughTarget(msg, isCurrent, g, after, attempt + 1));
  }
  console.warn('[aim-bridge] SET_SECTION: prvok bez geometrie alebo bez osi', msg.guids ?? msg.coordinate);
  return Promise.resolve(false);
}

/**
 * `SET_SECTION_BOX` (AIM D-132): box okolo prvkov s okrajom, alebo presná obálka
 * v IFC svete. Prvky bez geometrie (ešte prúdi) sa skúšajú znova ako rez cez prvok.
 */
export function applySectionBox(msg: SectionBoxMessage, g: GuidHelpers, attempt = 0): Promise<boolean> {
  const state = useViewerStore.getState();
  if (msg.box) {
    const offset = worldOffset(state);
    state.setSectionBox(toSectionBox(orderedBox(ifcPointToRender(msg.box.min, offset), ifcPointToRender(msg.box.max, offset))));
    return Promise.resolve(true);
  }
  const union = renderBoundsOfGuids(state, msg.guids ?? [], g).union;
  if (union) {
    state.setSectionBox(toSectionBox(union, msg.marginM ?? 0.5));
    return Promise.resolve(true);
  }
  if (attempt < SECTION_RETRIES) return new Promise((r) => setTimeout(r, SECTION_RETRY_MS)).then(() => applySectionBox(msg, g, attempt + 1));
  return Promise.resolve(false);
}

/** `QUERY` -> `QUERY_RESULT` rodičovi s tým istým id; chyba výpočtu sa vráti ako `ok: false`. */
export function answerQuery(msg: Extract<ViewInboundMessage, { type: 'QUERY' }>, origin: string, g: GuidHelpers): void {
  const reply = (r: ViewQueryResult) => window.parent.postMessage(r, origin);
  try {
    const state = useViewerStore.getState();
    const result = msg.query === 'bounds' ? queryBounds(state, msg.guids ?? [], g) : queryViewState(state, g);
    reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: true, result });
  } catch (err) {
    reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

function tilesLayout() {
  const t = useAimViewTabs.getState();
  return describeLayout(t, t, t.sceneId);
}
