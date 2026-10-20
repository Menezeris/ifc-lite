/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výplň a popis ofarbených miestností v 2D pôdoryse (AIM D-119, #137). Spodná
 * plocha IfcSpace sa v hĺbke bije s podlahovou doskou, takže farba Lens bola v
 * 2D len v pásoch. Vrstva nad scénou (ako `ZoneOverlay` a piny) preto v režime
 * 2D bez výkresu nakreslí pôdorys každej miestnosti s farbou aktívnej Lens:
 * polopriehľadná výplň, obrys a názov (LongName, inak Name). Len miestnosti
 * podlažia 2D pohľadu; kliky prechádzajú do scény.
 */

import { useMemo } from 'react';
import type { MeshData } from '@ifc-lite/geometry';
import { IfcTypeEnum, type SpatialNode } from '@ifc-lite/data';
import { useViewerStore } from '../store/index.js';
import { fromGlobalIdFromModels } from '../store/globalId.js';
import { useProjectorTick } from '@/components/viewport-ui/scene';
import { footprintOutline, footprintPath, spaceFootprint, type Footprint, type Vec3 } from './aimRoomFill.js';

type State = ReturnType<typeof useViewerStore.getState>;

interface Room {
  id: number;
  color: string;
  label: string;
  footprint: Footprint;
}

/** Meshe miestností podľa globalId zo všetkých modelov federácie. */
function spaceMeshes(state: State): Map<number, MeshData[]> {
  const out = new Map<number, MeshData[]>();
  const add = (meshes: readonly MeshData[] | undefined) => {
    for (const m of meshes ?? []) {
      if (m.ifcType !== 'IfcSpace') continue;
      const list = out.get(m.expressId);
      if (list) list.push(m);
      else out.set(m.expressId, [m]);
    }
  };
  for (const model of state.models.values()) add(model.geometryResult?.meshes);
  if (state.models.size === 0) add(state.geometryResult?.meshes);
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

function roomsToFill(state: State, meshes: Map<number, MeshData[]>, footprints: Map<number, Footprint | null>): Room[] {
  const storeyGuid = state.underlayActiveStoreyGuid;
  const labels = new Map<string, Map<number, string>>();
  const rooms: Room[] = [];
  for (const [id, color] of state.lensColorMap) {
    const parts = meshes.get(id);
    if (!parts) continue;
    const ref = fromGlobalIdFromModels(state.models, id);
    const store = ref ? (state.models.get(ref.modelId)?.ifcDataStore ?? state.ifcDataStore) : state.ifcDataStore;
    if (ref && store && storeyGuid) {
      // Miestnosť z iného podlažia nie je v reze tohto pôdorysu.
      const storey = store.entities.getExpressIdByGlobalId(storeyGuid);
      // @raw-entity-enumeration-ok point lookup of one room's storey for the plan cut; AIM never edits the spatial structure
      const own = store.spatialHierarchy?.elementToStorey.get(ref.expressId);
      if (storey !== -1 && own !== undefined && own !== storey) continue;
    }
    let fp = footprints.get(id);
    if (fp === undefined) {
      fp = spaceFootprint(parts);
      footprints.set(id, fp);
    }
    if (!fp) continue;
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

export function AimRoomFillLayer() {
  const planView = useViewerStore((s) => s.underlayViewLocked && !s.underlaySplitView);
  const lensColorMap = useViewerStore((s) => s.lensColorMap);
  const activeLensId = useViewerStore((s) => s.activeLensId);
  const storeyGuid = useViewerStore((s) => s.underlayActiveStoreyGuid);
  const models = useViewerStore((s) => s.models);
  const geometryResult = useViewerStore((s) => s.geometryResult);
  const project = useViewerStore((s) => s.cameraCallbacks.projectToScreen);
  const active = planView && activeLensId !== null && lensColorMap.size > 0 && !!project;
  const tick = useProjectorTick(active);

  // Pôdorys sa počíta raz na geometriu; farby a podlažie len vyberajú.
  const meshes = useMemo(() => (active ? spaceMeshes(useViewerStore.getState()) : new Map()), [active, models, geometryResult]);
  const footprints = useMemo(() => new Map<number, Footprint | null>(), [meshes]);
  const rooms = useMemo(
    () => (active && meshes.size > 0 ? roomsToFill(useViewerStore.getState(), meshes, footprints) : []),
    [active, meshes, footprints, lensColorMap, storeyGuid],
  );

  if (!active || rooms.length === 0 || !project) return null;
  void tick; // nový tick = tie isté body na nových súradniciach obrazovky
  const toScreen = (p: Vec3) => project(p);
  return (
    <svg className="absolute inset-0 pointer-events-none z-20" style={{ overflow: 'visible' }} data-aim-room-fill={rooms.length}>
      {rooms.map((room) => {
        const d = footprintPath(room.footprint.triangles, toScreen);
        return d ? (
          <g key={room.id}>
            <path d={d} fill={room.color} fillOpacity={0.45} />
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
  );
}
