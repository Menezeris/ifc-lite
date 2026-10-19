/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čisté výpočty spätného kanála a rezu cez prvok (AIM D-085): render rámec
 * <-> IFC svet, obálky, rovina cez prvok. Vlastný modul, ktorý importuje len
 * lenivo načítaný `viewQueries.ts` - vo vstupnom balíku viewera nie je.
 */

import type { SectionPlaneAxis } from '@/store/types';
import { worldToPercent, type AxisRange } from '@/lib/section/section-distance';
import { ifcToViewerAxes, viewerToIfcAxes } from '@ifc-lite/geometry/world-frame';
import type { SectionAxis, SectionFit } from './view-protocol.js';

export interface Vec3 { x: number; y: number; z: number }
export interface Box3 { min: Vec3; max: Vec3 }

/**
 * Písmeno osi hosta -> os rezu viewera, to isté ako `VIEWER_AXIS` vo
 * `viewCommands.ts` (test to stráži). Vlastná kópia, lebo import z
 * `viewCommands.ts` by ho vytrhol do zdieľaného chunku a zväčšil vstup.
 */
export function viewerAxis(axis: SectionAxis): SectionPlaneAxis {
  return axis === 'x' ? 'side' : axis === 'y' ? 'down' : 'front';
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

/** Bod v IFC svete -> render rámec (inverz `renderPointToIfc`), napr. póza kamery od hosta (AIM D-098). */
export function ifcPointToRender(p: Vec3, offset: Vec3): Vec3 {
  return ifcToViewerAxes({ x: p.x - offset.x, y: p.y - offset.y, z: p.z - offset.z });
}

/** Smer (bez posunu rámca), napr. `up` kamery: render -> IFC a späť. */
export const renderDirToIfc = (v: Vec3): Vec3 => viewerToIfcAxes(v);
export const ifcDirToRender = (v: Vec3): Vec3 => ifcToViewerAxes(v);

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
