/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Prevod pohľadu z Presentation (`BasketView`, render rámec viewera, `modelId:expressId`) na drôt
 * (`ViewWire`, IFC svet v metroch, GlobalId) a späť (AIM D-161). Čisté funkcie bez store: všetko, čo
 * závisí od načítaných modelov (posun rámca, obálka rezu, GUID, viditeľné prvky), dodá volajúci v
 * `CodecEnv`. Kamera a rez sa po obnove modelu s iným posunom rámca vrátia na to isté miesto v IFC.
 */

import type { BasketSectionSnapshot, BasketView } from '@/store/slices/pinboardSlice';
import type { CameraViewpoint, SectionPlane } from '@/store/types';
import { percentToWorld, sectionAxisRange, type AxisBounds } from '@/lib/section/section-distance';
import {
  cutPercent, hostAxis, ifcCoordinateToRender, ifcDirToRender, ifcPointToRender, renderBoxToIfc, renderDirToIfc, renderPointToIfc, viewerAxis,
  type Vec3,
} from './viewFrame.js';
import {
  MAX_BASKET_GUIDS, type Vec3Wire, type ViewBasketWire, type ViewCameraWire, type ViewSectionPlaneWire, type ViewSectionWire, type ViewWire,
} from './views-protocol.js';
import type { UnderlaysViewWire } from './underlaysPlan.js';

export interface CodecEnv {
  /** Posun rámca modelu (`bcfWorldOffset`). */
  offset: Vec3;
  /** Obálka, voči ktorej renderer reže (percentá rezu); null kým geometria neprišla. */
  bounds: AxisBounds | null;
  guidOfKey: (key: string) => string | undefined;
  keyOfGuid: (guid: string) => string | undefined;
  /** Kľúče všetkého, čo "=" dá do košíka bez výberu (viditeľné prvky). */
  visibleKeys: () => ReadonlySet<string>;
  /** GUID skrytých prvkov. */
  hiddenGuids: () => string[];
  /** Nová rovina rezu so štýlom aktuálnej (stred roviny sa prepíše). */
  makePlane: (name: string) => SectionPlane;
  /** Stav PDF podkladov uložený s pohľadom (AIM #325). */
  underlaysOf?: (viewId: string) => UnderlaysViewWire | undefined;
}

const mm = (v: number) => Math.round(v * 1000) / 1000;
const ur = (v: number) => Math.round(v * 1e6) / 1e6;
const tuple = (v: Vec3, round: (n: number) => number): Vec3Wire => [round(v.x), round(v.y), round(v.z)];
const vec = (t: readonly number[]): Vec3 => ({ x: t[0], y: t[1], z: t[2] });

function encodeCamera(vp: CameraViewpoint, offset: Vec3): ViewCameraWire {
  return {
    position: tuple(renderPointToIfc(vp.position, offset), mm),
    target: tuple(renderPointToIfc(vp.target, offset), mm),
    up: tuple(renderDirToIfc(vp.up), ur),
    fov: ur(vp.fov),
    projection: vp.projectionMode,
    ...(vp.orthoSize !== undefined ? { ortho_size: mm(vp.orthoSize) } : {}),
  };
}

function decodeCamera(c: ViewCameraWire, offset: Vec3): CameraViewpoint {
  return {
    position: ifcPointToRender(vec(c.position), offset),
    target: ifcPointToRender(vec(c.target), offset),
    up: ifcDirToRender(vec(c.up)),
    fov: c.fov,
    projectionMode: c.projection,
    ...(c.ortho_size !== undefined ? { orthoSize: c.ortho_size } : {}),
  };
}

/** Súradnica roviny v IFC svete na osi hosta (x = IFC X, y = IFC Z, z = IFC Y). */
function planeCoordinate(plane: SectionPlane, env: CodecEnv): number | undefined {
  const range = env.bounds ? sectionAxisRange(env.bounds, plane.axis) : null;
  if (!range) return undefined;
  const axis = hostAxis(plane.axis);
  const point = { x: 0, y: 0, z: 0 };
  point[axis] = percentToWorld(plane.position, range);
  const ifc = renderPointToIfc(point, env.offset);
  return mm(axis === 'x' ? ifc.x : axis === 'y' ? ifc.z : ifc.y);
}

function encodePlane(plane: SectionPlane, env: CodecEnv): ViewSectionPlaneWire {
  const coordinate = plane.box ? undefined : planeCoordinate(plane, env);
  const box = plane.box ? renderBoxToIfc({ min: vec(plane.box.min), max: vec(plane.box.max) }, env.offset) : null;
  return {
    name: plane.name,
    axis: hostAxis(plane.axis),
    position_percent: Math.round(plane.position * 1000) / 1000,
    ...(coordinate !== undefined ? { coordinate } : {}),
    flipped: plane.flipped,
    enabled: plane.enabled,
    show_gizmo: plane.showGizmo,
    show_cap: plane.showCap,
    show_outlines: plane.showOutlines,
    ...(box ? { box: { min: tuple(box.min, mm), max: tuple(box.max, mm) } } : {}),
  };
}

function encodeSection(s: BasketSectionSnapshot, env: CodecEnv): ViewSectionWire {
  // Rovina z vlastnej normály (face-pick) sa uloží ako najbližšia kardinálna (axis a position sú s ňou v súlade).
  const planes = s.planes ?? [s.plane];
  return { planes: planes.map((p) => encodePlane(p, env)), active: Math.min(Math.max(s.activeIndex ?? 0, 0), planes.length - 1) };
}

function decodePlane(w: ViewSectionPlaneWire, env: CodecEnv): SectionPlane {
  const axis = viewerAxis(w.axis);
  const range = env.bounds ? sectionAxisRange(env.bounds, axis) : null;
  const exact = w.coordinate !== undefined && !w.box ? cutPercent(ifcCoordinateToRender(w.axis, w.coordinate, env.offset), range) : null;
  const a = w.box ? ifcPointToRender(vec(w.box.min), env.offset) : null;
  const b = w.box ? ifcPointToRender(vec(w.box.max), env.offset) : null;
  return {
    ...env.makePlane(w.name),
    axis,
    position: exact ?? w.position_percent,
    enabled: w.enabled,
    flipped: w.flipped,
    showGizmo: w.show_gizmo,
    showCap: w.show_cap,
    showOutlines: w.show_outlines,
    ...(a && b ? {
      box: {
        min: [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)] as [number, number, number],
        max: [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)] as [number, number, number],
      },
    } : {}),
  };
}

function decodeSection(w: ViewSectionWire, env: CodecEnv): BasketSectionSnapshot {
  const planes = w.planes.map((p) => decodePlane(p, env));
  return { plane: planes[w.active], planes, activeIndex: w.active, drawing2D: null, show3DOverlay: false, showHiddenLines: false };
}

const sameSet = (keys: readonly string[], set: ReadonlySet<string>) => keys.length === set.size && keys.every((k) => set.has(k));

/** Košík ako GlobalId: "všetko viditeľné" bez zoznamu (výsledok "="), inak zoznam so stropom. */
function encodeBasket(view: BasketView, env: CodecEnv): ViewBasketWire {
  if (view.source === 'visible' && sameSet(view.entityRefs, env.visibleKeys())) {
    const hidden = env.hiddenGuids();
    if (hidden.length <= MAX_BASKET_GUIDS) return { scope: 'all', hidden_guids: hidden };
  }
  const guids: string[] = [];
  for (const key of view.entityRefs) {
    const g = env.guidOfKey(key);
    if (g) guids.push(g);
  }
  return guids.length > MAX_BASKET_GUIDS
    ? { scope: 'guids', guids: guids.slice(0, MAX_BASKET_GUIDS), truncated: true }
    : { scope: 'guids', guids };
}

export function encodeView(view: BasketView, order: number, env: CodecEnv): ViewWire {
  return {
    id: view.id,
    name: view.name,
    order,
    transition_ms: view.transitionMs,
    source: view.source,
    camera: view.viewpoint ? encodeCamera(view.viewpoint, env.offset) : null,
    section: view.section ? encodeSection(view.section, env) : null,
    basket: encodeBasket(view, env),
    objects: view.entityRefs.length,
    ...withUnderlays(env.underlaysOf?.(view.id)),
  };
}

const withUnderlays = (u: UnderlaysViewWire | undefined) => (u ? { underlays: u } : {});

/** Pohľad z drôtu; `missing` = prvky košíka, ktoré model (revízia) už nemá. Náhľad ostáva z `prev`. */
export function decodeView(w: ViewWire, env: CodecEnv, prev?: BasketView): { view: BasketView; missing: number } {
  let missing = 0;
  let keys: string[];
  if (w.basket.scope === 'all') {
    const hidden = new Set<string>();
    for (const g of w.basket.hidden_guids) {
      const k = env.keyOfGuid(g);
      if (k) hidden.add(k);
    }
    keys = [...env.visibleKeys()].filter((k) => !hidden.has(k));
  } else {
    keys = [];
    for (const g of w.basket.guids) {
      const k = env.keyOfGuid(g);
      if (k) keys.push(k);
      else missing++;
    }
  }
  const now = Date.now();
  return {
    missing,
    view: {
      id: w.id,
      name: w.name,
      entityRefs: keys,
      thumbnailDataUrl: prev?.thumbnailDataUrl ?? null,
      transitionMs: w.transition_ms,
      viewpoint: w.camera ? decodeCamera(w.camera, env.offset) : null,
      section: w.section ? decodeSection(w.section, env) : null,
      source: w.source,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

/** Odtlačok obsahu pohľadu bez poradia; zmena odtlačku = pohľad treba poslať hostovi. FNV-1a 32 b + dĺžka. */
export function fingerprint(view: BasketView, env: CodecEnv): string {
  const json = JSON.stringify({ ...encodeView(view, 0, env), name: '' });
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}:${json.length}`;
}
