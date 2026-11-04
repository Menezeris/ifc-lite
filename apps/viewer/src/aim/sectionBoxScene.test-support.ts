/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Inline STEP model for the Box cut tests: one IfcSpace with a floor slab,
 * a ceiling slab and four walls, parsed by the real columnar parser, plus
 * the matching render-frame meshes (Y up). Fixture support, no tests.
 */

import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import type { MeshData } from '@ifc-lite/geometry';
import { useViewerStore } from '@/store/index.js';
import type { FederatedModel } from '@/store/types.js';

export const SPACE = 10, FLOOR = 11, CEILING = 12, WALL_L = 13, WALL_R = 14, WALL_B = 15, WALL_F = 16, FAR_WALL = 17;
const guid = (n: number) => `0GUID${String(n).padStart(17, '0')}`;

const STEP = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('box-cut.ifc','2020-01-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('${guid(1)}',$,'Project',$,$,$,$,$,$);
#${SPACE}=IFCSPACE('${guid(SPACE)}',$,'Room',$,$,$,$,$,.ELEMENT.,.INTERNAL.,$);
#${FLOOR}=IFCSLAB('${guid(FLOOR)}',$,'Floor',$,$,$,$,$,.FLOOR.);
#${CEILING}=IFCSLAB('${guid(CEILING)}',$,'Ceiling',$,$,$,$,$,.FLOOR.);
#${WALL_L}=IFCWALL('${guid(WALL_L)}',$,'WL',$,$,$,$,$);
#${WALL_R}=IFCWALL('${guid(WALL_R)}',$,'WR',$,$,$,$,$);
#${WALL_B}=IFCWALL('${guid(WALL_B)}',$,'WB',$,$,$,$,$);
#${WALL_F}=IFCWALL('${guid(WALL_F)}',$,'WF',$,$,$,$,$);
#${FAR_WALL}=IFCWALL('${guid(FAR_WALL)}',$,'Far',$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
`;

type B = [number, number, number, number, number, number];
/** [minX, minY, minZ, maxX, maxY, maxZ] in the render frame. */
export const BOXES: Record<number, B> = {
  [SPACE]: [0, 0, 0, 4, 2.7, 3],
  [FLOOR]: [-0.2, -0.25, -0.2, 4.2, 0, 3.2],
  [CEILING]: [-0.2, 2.7, -0.2, 4.2, 2.95, 3.2],
  [WALL_L]: [-0.2, 0, -0.2, 0, 2.7, 3.2],
  [WALL_R]: [4, 0, -0.2, 4.2, 2.7, 3.2],
  [WALL_B]: [-0.2, 0, -0.2, 4.2, 2.7, 0],
  [WALL_F]: [-0.2, 0, 3, 4.2, 2.7, 3.2],
  [FAR_WALL]: [20, 0, 20, 20.2, 2.7, 24],
};

const TYPE: Record<number, string> = {
  [SPACE]: 'IfcSpace', [FLOOR]: 'IfcSlab', [CEILING]: 'IfcSlab',
  [WALL_L]: 'IfcWall', [WALL_R]: 'IfcWall', [WALL_B]: 'IfcWall', [WALL_F]: 'IfcWall', [FAR_WALL]: 'IfcWall',
};

function mesh(id: number, [x0, y0, z0, x1, y1, z1]: B): MeshData {
  return {
    expressId: id, ifcType: TYPE[id],
    positions: new Float32Array([x0, y0, z0, x1, y1, z1, x0, y1, z0]),
    normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]), color: [1, 1, 1, 1],
  } as MeshData;
}

let cached: Promise<IfcDataStore> | null = null;
export function parseBoxCutModel(): Promise<IfcDataStore> {
  if (!cached) {
    const bytes = new TextEncoder().encode(STEP);
    cached = new IfcParser().parseColumnar(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  return cached;
}

/** One model `m1` with offset 0 (global id = express id) and the meshes above. */
export async function seedBoxCutModel(): Promise<void> {
  const ifcDataStore = await parseBoxCutModel();
  const geometryResult = { meshes: Object.entries(BOXES).map(([id, b]) => mesh(Number(id), b)) } as FederatedModel['geometryResult'];
  useViewerStore.setState({
    models: new Map([['m1', {
      id: 'm1', name: 'm1.ifc', ifcDataStore, geometryResult, visible: true, collapsed: false,
      schemaVersion: 'IFC4', loadedAt: 1, fileSize: 0, idOffset: 0, maxExpressId: 1000,
    } as FederatedModel]]),
    geometryResult,
    selectedEntityId: null,
    selectedEntityIds: new Set<number>(),
  });
  useViewerStore.getState().clearSectionPlanes();
}
