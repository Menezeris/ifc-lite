/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Poloha a smer kamery na kalibrovanom PDF pôdoryse (AIM D-161 bod 8, #282). Čisté funkcie bez
 * store a Reactu (test): z umiestnenia výkresu (`_georef` podlažia, D-072) a živej kamery spočítajú
 * bodku a smer pohľadu v % strany PDF. Logika je prevzatá z `DrawingPlanPane` (D-072 split), ktorý
 * sa už nemontuje; značka teraz sedí na stránke PDF dokumentu v záložke alebo dlaždici.
 */

import {
  applyAffine,
  ifcMetresToPage,
  invertAffine,
  worldToIfcMetres,
  type Affine2x3,
} from '@ifc-lite/drawing-underlay';

export interface PlanPlacementLike {
  affine: Affine2x3;
  pageSize: [number, number];
  page: number;
}

export interface PlanCameraLike {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
}

export interface PlanMarker {
  /** Poloha bodky v % šírky strany (0 vľavo). */
  left: number;
  /** Poloha bodky v % výšky strany (0 hore). */
  top: number;
  /** Smer pohľadu v stupňoch po smere hodín od "hore" na strane. */
  angleDeg: number;
}

/** Bodka sa kreslí aj kúsok za okrajom strany, ďalej nie (kamera mimo výkresu). */
const EDGE_PCT = 5;

/**
 * Značka kamery na strane výkresu alebo null: kamera mimo výkresu, degenerované umiestnenie.
 * Smer je vodorovný priemet pohľadu (pri pohľade zhora sa berie `up`).
 */
export function planMarker(
  placement: PlanPlacementLike,
  offset: { x: number; y: number; z: number },
  cam: PlanCameraLike,
): PlanMarker | null {
  const [w, h] = placement.pageSize;
  if (!(w > 0) || !(h > 0)) return null;
  try {
    const page = ifcMetresToPage(placement.affine, worldToIfcMetres(cam.position, offset));
    let fx = cam.target.x - cam.position.x;
    let fz = cam.target.z - cam.position.z;
    if (Math.hypot(fx, fz) < 1e-3) {
      fx = cam.up.x;
      fz = cam.up.z;
    }
    const inv = invertAffine(placement.affine);
    const o = applyAffine(inv, { x: 0, y: 0 });
    const q = applyAffine(inv, { x: fx, y: -fz });
    const angleDeg = (Math.atan2(q.x - o.x, q.y - o.y) * 180) / Math.PI;
    const left = (page.x / w) * 100;
    const top = ((h - page.y) / h) * 100;
    if (![left, top, angleDeg].every(Number.isFinite)) return null;
    if (left < -EDGE_PCT || left > 100 + EDGE_PCT || top < -EDGE_PCT || top > 100 + EDGE_PCT) return null;
    return { left, top, angleDeg };
  } catch {
    return null;
  }
}

export interface PlanMarkerState {
  document_id: string;
  page: number;
  x_pct: number;
  y_pct: number;
  heading_deg: number;
}

/**
 * Stav pre `get_viewer_state.plan_position`: všetky značky, ktoré sa práve kreslia (záložka a dlaždice, aj dva
 * rôzne PDF naraz), zoradené podľa dokumentu a strany. Hodnoty sú zaokrúhlené, aby sa nemenili na každý šum.
 */
export function describePlanMarkers(
  enabled: boolean,
  shown: readonly { docId: string; page: number; marker: PlanMarker }[],
): { enabled: boolean; shown: boolean; markers: PlanMarkerState[] } {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const markers = [...shown]
    .sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : a.page - b.page))
    .map(({ docId, page, marker }) => ({
      document_id: docId,
      page,
      x_pct: r1(marker.left),
      y_pct: r1(marker.top),
      heading_deg: ((Math.round(marker.angleDeg) % 360) + 360) % 360,
    }));
  return { enabled, shown: markers.length > 0, markers };
}
