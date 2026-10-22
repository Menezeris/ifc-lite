/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čiara trasy od hosta (AIM D-137): `ROUTE_SHOW` nesie body lomenej čiary v IFC
 * svete (Z hore, m), ktoré host vypočítal 1,6 m nad podlahou a stupňami. Tu len
 * prevod do render rámca (ten istý ako pri kótach, `ifcPointToRender`) a SVG
 * cesta z premietnutých bodov. Bez väzby na store viewera (testuje sa samostatne).
 */

import { ifcPointToRender, type Vec3 } from './viewFrame.js';

/** Body IFC svet -> render rámec viewera. */
export function routeToRender(points: readonly Vec3[], offset: Vec3): Vec3[] {
  return points.map((p) => ifcPointToRender(p, offset));
}

/**
 * SVG `d` lomenej čiary; bod, ktorý sa nedá premietnuť (za kamerou), ju preruší.
 * Prázdny reťazec = nie je čo kresliť.
 */
export function routePath(points: readonly Vec3[], project: (p: Vec3) => { x: number; y: number } | null): string {
  const parts: string[] = [];
  let open = false;
  for (const p of points) {
    const s = project(p);
    if (!s) {
      open = false;
      continue;
    }
    parts.push(`${open ? 'L' : 'M'}${s.x.toFixed(1)} ${s.y.toFixed(1)}`);
    open = true;
  }
  // Samotné "M" bez úsečky nič nenakreslí.
  return parts.some((c) => c.startsWith('L')) ? parts.join(' ') : '';
}
