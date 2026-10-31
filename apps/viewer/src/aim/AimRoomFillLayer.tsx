/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výplň a popis ofarbených miestností v pôdoryse (AIM D-119, #137). Spodná
 * plocha IfcSpace sa v hĺbke bije s podlahovou doskou, takže farba Lens bola v
 * pôdoryse len v pásoch. Vrstva nad scénou (ako `ZoneOverlay` a piny) preto, keď je
 * aktívny vodorovný rez a kamera hľadí zhora (`mode=2d`, alebo `set_section` +
 * `set_camera top`, D-125 #175), nakreslí pôdorys každej miestnosti preťatej rezom
 * s farbou aktívnej Lens: polopriehľadná výplň, obrys a názov (LongName, inak Name).
 * Vyplní aj vybranú miestnosť farbou výberu, nielen ofarbenú Lens. Kliky prechádzajú
 * do scény. Od D-161 neexistuje zamknutý pôdorys, riadi sa len rezom a smerom kamery.
 *
 * Doplnok D-125 (#175): v 3D mimo pôdorysu kreslí podstavu `AimRoomFill3d` cez
 * výplne renderera, kúsok nad podlahovou krytinou a zakrytú stenami pred ňou.
 */

import { useEffect, useMemo } from 'react';
import type { MeshData } from '@ifc-lite/geometry';
import { IfcTypeEnum, type SpatialNode } from '@ifc-lite/data';
import { useViewerStore } from '../store/index.js';
import { fromGlobalIdFromModels } from '../store/globalId.js';
import { useProjectorTick } from '@/components/viewport-ui/scene';
import { activeSectionPlane } from '@/store/section-active';
import { percentToWorld, sectionAxisRange } from '@/lib/section/section-distance';
import { placementCoordinateInfo } from '@/lib/section/placement-coordinate-info';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { cutsRoom, footprintOutline, footprintPath, looksDown, spaceFootprint, type Footprint, type Vec3 } from './aimRoomFill.js';
import { sectionRenderBounds } from './sectionRange.js';
import { fillsRoom, floorLevel, roomFills, type Box3, type RoomFill3d } from './aimRoomFill3d.js';
import { useAimRoomFill3dStore } from './aimRoomFill3dStore.js';
import { useAimFocusRoomsStore } from './aimFocusRoomsStore.js';
import { roomColorMap } from './aimRoomColors.js';
import { SPACE_MAX_OPACITY } from './aimSpaceColor.js';

/** Farba vybranej miestnosti, ktorú Lens neofarbila. */
const SELECTED_COLOR = '#2563eb';

type State = ReturnType<typeof useViewerStore.getState>;

interface Room {
  id: number;
  color: string;
  label: string;
  footprint: Footprint;
}

/** Meshe triedy (IfcSpace, IfcCovering) podľa globalId zo všetkých modelov federácie. */
function meshesOf(state: State, ifcType = 'IfcSpace'): Map<number, MeshData[]> {
  const out = new Map<number, MeshData[]>();
  const add = (meshes: readonly MeshData[] | undefined) => {
    for (const m of meshes ?? []) {
      if (m.ifcType !== ifcType) continue;
      const list = out.get(m.expressId);
      if (list) list.push(m);
      else out.set(m.expressId, [m]);
    }
  };
  for (const model of state.models.values()) add(model.geometryResult?.meshes);
  if (state.models.size === 0) add(state.geometryResult?.meshes);
  return out;
}

/** Obálky krytín vo svete (kandidáti na podlahu; výšku vyberie `floorLevel`). */
function coveringBoxes(state: State): Box3[] {
  const out: Box3[] = [];
  for (const parts of meshesOf(state, 'IfcCovering').values()) {
    const b: Box3 = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    for (const { positions: p, origin } of parts) {
      const [ox, oy, oz] = [origin?.[0] ?? 0, origin?.[1] ?? 0, origin?.[2] ?? 0];
      for (let i = 0; i + 2 < p.length; i += 3) {
        b.minX = Math.min(b.minX, p[i] + ox); b.maxX = Math.max(b.maxX, p[i] + ox);
        b.minY = Math.min(b.minY, p[i + 1] + oy); b.maxY = Math.max(b.maxY, p[i + 1] + oy);
        b.minZ = Math.min(b.minZ, p[i + 2] + oz); b.maxZ = Math.max(b.maxZ, p[i + 2] + oz);
      }
    }
    if (Number.isFinite(b.minY)) out.push(b);
  }
  return out;
}

/** Popisy miestností (LongName, inak Name) podľa lokálneho id v modeli. */
function spaceLabels(root: SpatialNode | undefined): Map<number, string> {
  const out = new Map<number, string>();
  const stack = root ? [root] : [];
  while (stack.length > 0) {
    const node = stack.pop() as SpatialNode;
    if (node.type === IfcTypeEnum.IfcSpace) out.set(node.expressId, node.longName || node.name);
    stack.push(...node.children);
  }
  return out;
}

/** Farby miestností: Lens, vybrané farbou výberu (D-125), zvýraznené z FOCUS oranžovou (#319). */
function roomColors(state: State, meshes: Map<number, MeshData[]>): Map<number, string> {
  const selected = state.selectedEntityIds.size > 0 ? state.selectedEntityIds : state.selectedEntityId !== null ? [state.selectedEntityId] : [];
  const focus = useAimFocusRoomsStore.getState();
  return roomColorMap({
    lens: state.lensColorMap, selected, isRoom: (id) => meshes.has(id), focused: focus.ids,
    selectedColor: SELECTED_COLOR, focusColor: focus.color,
  });
}

/** Výška vodorovného rezu v render rámci, alebo null (iná os, bez rezu, bez obálky). */
function horizontalCut(state: State): number | null {
  const plane = activeSectionPlane(state);
  if (!plane || plane.axis !== 'down') return null;
  const range = sectionAxisRange(sectionRenderBounds(state, placementCoordinateInfo), plane.axis);
  return range ? percentToWorld(plane.position, range) : null;
}

function roomsToFill(
  state: State, meshes: Map<number, MeshData[]>, footprints: Map<number, Footprint | null>, cutY: number,
): Room[] {
  const labels = new Map<string, Map<number, string>>();
  const rooms: Room[] = [];
  for (const [id, color] of roomColors(state, meshes)) {
    const parts = meshes.get(id);
    if (!parts) continue;
    const ref = fromGlobalIdFromModels(state.models, id);
    const store = ref ? (state.models.get(ref.modelId)?.ifcDataStore ?? state.ifcDataStore) : state.ifcDataStore;
    let fp = footprints.get(id);
    if (fp === undefined) {
      fp = spaceFootprint(parts);
      footprints.set(id, fp);
    }
    if (!fp || !cutsRoom(fp, cutY)) continue;
    let byModel = ref ? labels.get(ref.modelId) : undefined;
    if (ref && !byModel) {
      byModel = spaceLabels(store?.spatialHierarchy?.project);
      labels.set(ref.modelId, byModel);
    }
    const label = (ref && byModel?.get(ref.expressId)) || (ref && store?.entities.getName(ref.expressId)) || '';
    rooms.push({ id, color, label, footprint: fp });
  }
  return rooms;
}

/** Ofarbené alebo vybrané miestnosti? (spoločná podmienka 2D aj 3D výplne) */
function useColored(): boolean {
  const focused = useAimFocusRoomsStore((s) => s.ids.size > 0);
  return useViewerStore((s) => (s.activeLensId !== null && s.lensColorMap.size > 0) || s.selectedEntityIds.size > 0 || s.selectedEntityId !== null) || focused;
}

/**
 * Podstava ofarbených a vybraných miestností v 3D (doplnok D-125, #175): výplne
 * renderera nad krytinou; `off` = kreslí SVG pôdorys, farba by sa zdvojila.
 */
function AimRoomFill3d({ off }: { off: boolean }) {
  const on = useColored() && !off;
  const lensColorMap = useViewerStore((s) => s.lensColorMap);
  const lensHidden = useViewerStore((s) => s.lensHiddenIds);
  const selectedIds = useViewerStore((s) => s.selectedEntityIds);
  const selectedId = useViewerStore((s) => s.selectedEntityId);
  const focusIds = useAimFocusRoomsStore((s) => s.ids);
  const sectionPlane = useViewerStore((s) => s.sectionPlane);
  const hidden = useViewerStore((s) => s.hiddenEntities);
  const isolated = useViewerStore((s) => s.isolatedEntities);
  const models = useViewerStore((s) => s.models);
  const geometryResult = useViewerStore((s) => s.geometryResult);
  const setFills = useAimRoomFill3dStore((s) => s.setFills);
  const meshes = useMemo(() => (on ? meshesOf(useViewerStore.getState()) : new Map<number, MeshData[]>()), [on, models, geometryResult]);
  const coverings = useMemo(() => (on ? coveringBoxes(useViewerStore.getState()) : []), [on, models, geometryResult]);
  const footprints = useMemo(() => new Map<number, Footprint | null>(), [meshes]);
  const fills = useMemo(() => {
    const out: RoomFill3d[] = [];
    if (!on || meshes.size === 0) return out;
    const state = useViewerStore.getState();
    const cutY = horizontalCut(state);
    for (const [id, color] of roomColors(state, meshes)) {
      const parts = meshes.get(id);
      if (!parts || !state.isEntityVisible(id) || state.lensHiddenIds.has(id)) continue;
      let fp = footprints.get(id);
      if (fp === undefined) {
        fp = spaceFootprint(parts);
        footprints.set(id, fp);
      }
      const level = fp ? floorLevel(fp, coverings) : 0;
      if (fp && fillsRoom(level, cutY)) out.push(...roomFills(fp, level, color));
    }
    return out;
  }, [on, meshes, coverings, footprints, lensColorMap, lensHidden, selectedIds, selectedId, focusIds, sectionPlane, hidden, isolated]);
  useEffect(() => setFills(fills), [fills, setFills]);
  useEffect(() => () => setFills([]), [setFills]);
  return null;
}

export function AimRoomFillLayer() {
  // Vodorovný rez (D-125): vrstva sleduje kameru, či hľadí zhora.
  const downCut = useViewerStore((s) => activeSectionPlane(s)?.axis === 'down');
  const lensColorMap = useViewerStore((s) => s.lensColorMap);
  const selectedIds = useViewerStore((s) => s.selectedEntityIds);
  const selectedId = useViewerStore((s) => s.selectedEntityId);
  const focusIds = useAimFocusRoomsStore((s) => s.ids);
  const sectionPlane = useViewerStore((s) => s.sectionPlane);
  const models = useViewerStore((s) => s.models);
  const geometryResult = useViewerStore((s) => s.geometryResult);
  const project = useViewerStore((s) => s.cameraCallbacks.projectToScreen);
  const colored = useColored();
  const tick = useProjectorTick(downCut && colored && !!project);
  const camera = downCut ? getGlobalRenderer()?.getCamera() : null;
  const plan3d = downCut && !!camera && looksDown(camera.getPosition(), camera.getTarget());
  const active = plan3d && colored && !!project;

  // Pôdorys sa počíta raz na geometriu; farby, výber, rez a podlažie len vyberajú.
  const meshes = useMemo(() => (active ? meshesOf(useViewerStore.getState()) : new Map()), [active, models, geometryResult]);
  const footprints = useMemo(() => new Map<number, Footprint | null>(), [meshes]);
  const rooms = useMemo(() => {
    if (!active || meshes.size === 0) return [];
    const state = useViewerStore.getState();
    const cutY = horizontalCut(state);
    return cutY === null ? [] : roomsToFill(state, meshes, footprints, cutY);
  }, [active, meshes, footprints, lensColorMap, selectedIds, selectedId, focusIds, sectionPlane]);

  const fill3d = <AimRoomFill3d off={plan3d} />;
  if (!active || rooms.length === 0 || !project) return fill3d;
  void tick; // nový tick = tie isté body na nových súradniciach obrazovky
  const toScreen = (p: Vec3) => project(p);
  return (
    <>
    {fill3d}
    <svg className="absolute inset-0 pointer-events-none z-20" style={{ overflow: 'visible' }} data-aim-room-fill={rooms.length}>
      {rooms.map((room) => {
        const d = footprintPath(room.footprint.triangles, toScreen);
        return d ? (
          <g key={room.id}>
            <path d={d} fill={room.color} fillOpacity={SPACE_MAX_OPACITY} />
            <path d={footprintOutline(room.footprint.triangles, toScreen)} fill="none" stroke={room.color} strokeWidth={2} />
          </g>
        ) : null;
      })}
      {rooms.map((room) => {
        const at = room.label ? toScreen(room.footprint.anchor) : null;
        return at ? (
          <text
            key={`t${room.id}`}
            x={at.x}
            y={at.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={600}
            fill="#111827"
            stroke="#ffffff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {room.label}
          </text>
        ) : null;
      })}
    </svg>
    </>
  );
}
