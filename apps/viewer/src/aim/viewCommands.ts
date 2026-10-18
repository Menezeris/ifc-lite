/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čisté výpočty pre bridge správy pohľadu (AIM D-083) - bez Reactu a store,
 * aby sa dali testovať. Vykonanie je v `useAimViewCommands.ts`.
 */

import type { SectionPlaneAxis } from '@/store/types';
import { worldToPercent, type AxisRange } from '@/lib/section/section-distance';
import { ifcToViewerAxes, viewerToIfcAxes } from '@ifc-lite/geometry/world-frame';
import type { CameraPreset, SectionAxis, SectionFit } from './view-protocol.js';

export interface Vec3 { x: number; y: number; z: number }
export interface Box3 { min: Vec3; max: Vec3 }

/** SDK / host os -> os rezu viewera (Y hore): x = side, y = down, z = front. */
export const VIEWER_AXIS: Record<SectionAxis, SectionPlaneAxis> = { x: 'side', y: 'down', z: 'front' };

/**
 * Poloha vodorovného rezu (0..100 % rozsahu osi `down`) pre rez `offsetM`
 * metrov nad úrovňou podlažia. Elevácia podlažia je v metroch v rámci IFC
 * (Z hore), rez pracuje v posunutom rámci renderera - preto `- offsetY`,
 * presne ako `worldCutY` v `useFloorplanView`. Bez rozsahu (nič nenačítané) null.
 */
export function storeyCutPercent(
  elevation: number,
  offsetM: number,
  offsetY: number,
  range: AxisRange | null,
): number | null {
  if (!range) return null;
  return worldToPercent(elevation + offsetM - offsetY, range);
}

export type CameraStep =
  | { kind: 'preset'; view: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' }
  | { kind: 'home' }
  | { kind: 'fit' };

/** Preset hosta -> volanie `cameraCallbacks` (iso = home, adaptívna JV izometria). */
export function cameraStep(preset: CameraPreset): CameraStep {
  if (preset === 'iso') return { kind: 'home' };
  if (preset === 'fit_all') return { kind: 'fit' };
  return { kind: 'preset', view: preset };
}

/**
 * Podlažie z bridge správy: bez GUID = `undefined` (useViewMode si vyberie
 * aktívne/posledné), známy GUID = podlažie, neznámy GUID = `null` - správa sa
 * nevykoná, aby viewer potichu neprepol na iné podlažie, než host žiadal.
 */
export function pickStorey<T extends { guid: string }>(storeys: readonly T[], guid?: string): T | undefined | null {
  if (!guid) return undefined;
  return storeys.find((s) => s.guid === guid) ?? null;
}

/** Os viewera -> písmeno osi hosta (inverz `VIEWER_AXIS`). */
export function hostAxis(axis: SectionPlaneAxis): SectionAxis {
  return axis === 'side' ? 'x' : axis === 'down' ? 'y' : 'z';
}

/** Zjednotenie obálok; prázdny zoznam = null. */
export function unionBoxes(boxes: readonly Box3[]): Box3 | null {
  if (boxes.length === 0) return null;
  const min = { ...boxes[0].min };
  const max = { ...boxes[0].max };
  for (const b of boxes) {
    min.x = Math.min(min.x, b.min.x); min.y = Math.min(min.y, b.min.y); min.z = Math.min(min.z, b.min.z);
    max.x = Math.max(max.x, b.max.x); max.y = Math.max(max.y, b.max.y); max.z = Math.max(max.z, b.max.z);
  }
  return { min, max };
}

/** Bod v render rámci (Y hore, posunutý) -> IFC svet (Z hore), `offset` z `bcfWorldOffset`. */
export function renderPointToIfc(p: Vec3, offset: Vec3): Vec3 {
  const z = viewerToIfcAxes(p);
  return { x: z.x + offset.x, y: z.y + offset.y, z: z.z + offset.z };
}

/** Obálka v render rámci -> IFC svet; os s otočeným znamienkom si vymení min a max. */
export function renderBoxToIfc(box: Box3, offset: Vec3): Box3 {
  const a = renderPointToIfc(box.min, offset);
  const b = renderPointToIfc(box.max, offset);
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}

/**
 * Súradnica roviny v IFC svete na osi hosta (x = IFC X, y = IFC Z, z = IFC Y)
 * -> súradnica na tej istej osi v render rámci.
 */
export function ifcCoordinateToRender(axis: SectionAxis, coordinate: number, offset: Vec3): number {
  const local = {
    x: axis === 'x' ? coordinate - offset.x : 0,
    y: axis === 'z' ? coordinate - offset.y : 0,
    z: axis === 'y' ? coordinate - offset.z : 0,
  };
  return ifcToViewerAxes(local)[axis];
}

/**
 * Rovina cez obálku prvku (render rámec). `along` = rovina pozdĺž dlhšej
 * vodorovnej osi prvku (rez schodiskom po dĺžke ramena), `across` = kolmo na
 * ňu, `center` = stredom na zadanej osi.
 */
export function sectionThroughBox(box: Box3, fit: SectionFit, axis?: SectionAxis): { axis: SectionAxis; world: number } | null {
  let cut: SectionAxis;
  if (fit === 'center') {
    if (!axis) return null;
    cut = axis;
  } else {
    const longIsX = box.max.x - box.min.x >= box.max.z - box.min.z;
    cut = (fit === 'along') === longIsX ? 'z' : 'x';
  }
  const world = (box.min[cut] + box.max[cut]) / 2;
  return Number.isFinite(world) ? { axis: cut, world } : null;
}

/** Svetová súradnica na osi -> poloha rezu 0..100 % rozsahu modelu, bez rozsahu null. */
export function cutPercent(world: number, range: AxisRange | null): number | null {
  return range ? worldToPercent(world, range) : null;
}
