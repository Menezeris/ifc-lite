/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM-FORK (whole file, AIM #284, D-179): vertical drawing underlays (section
 * drawings REZ-A, REZ-B) from the host's `georefV2.calibrations[]`.
 *
 * A v2 calibration with `plane = {origin, u, v}` (IFC model metres, Z up)
 * places one PDF page (or a `region` of it) on a vertical plane: page point
 * p -> (s, t) = affine(p) -> IFC point origin + s*u + t*v -> viewer world
 * through the same `ifcToWorld` and recentering offset as a floor plan.
 * `u x v` is the side the drawing is read from; the pipeline draws the other
 * side fainter (`SECTION_BACK_OPACITY`).
 *
 * Parsing is validating: `georefV2` is untrusted persisted JSON, so a malformed
 * entry is skipped (no placement) instead of throwing.
 */

import {
  DEFAULT_UNDERLAY_OPACITY,
  type DrawingPlacement,
  type PlacementCalibrationPair,
} from './placement.js';
import { applyAffine, type Affine2x3 } from './similarity.js';
// Types only: world-transform.ts imports this module (no runtime cycle).
import type { PlacementCorners, Vec3 } from './world-transform.js';

/** Vertical plane of a section drawing, IFC model metres (Z up). */
export interface SectionPlane {
  origin: [number, number, number];
  /** IFC direction of page s (along the cut). */
  u: [number, number, number];
  /** IFC direction of page t (usually +Z). */
  v: [number, number, number];
}

/** Part of the page shown, fractions of the page with a top-left origin. */
export interface PageRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Opacity factor of the back side (`-(u x v)`) of a section underlay. */
export const SECTION_BACK_OPACITY = 0.3;

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** `[x, y, z]` or `{x, y, z}` -> tuple; null when not three finite numbers. */
function vec3(v: unknown): [number, number, number] | null {
  if (Array.isArray(v)) return v.length === 3 && v.every(isNum) ? [v[0], v[1], v[2]] : null;
  if (isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.z)) return [v.x, v.y, v.z];
  return null;
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const length = (a: readonly number[]) => Math.hypot(a[0], a[1], a[2]);

/** Validate a wire plane: finite vectors, u and v neither zero nor parallel. */
export function parseSectionPlane(raw: unknown): SectionPlane | null {
  if (!isObj(raw)) return null;
  const origin = vec3(raw.origin);
  const u = vec3(raw.u);
  const v = vec3(raw.v);
  if (!origin || !u || !v) return null;
  if (length(u) < 1e-9 || length(v) < 1e-9) return null;
  if (length(cross(u, v)) < 1e-9 * length(u) * length(v)) return null;
  return { origin, u, v };
}

/** Region `{x, y, w, h}` (fractions, top-left) clamped to the page; null = whole page. */
export function parsePageRegion(raw: unknown): PageRegion | null {
  if (!isObj(raw) || ![raw.x, raw.y, raw.w, raw.h].every(isNum)) return null;
  const x = Math.min(Math.max(raw.x as number, 0), 1);
  const y = Math.min(Math.max(raw.y as number, 0), 1);
  const w = Math.min(raw.w as number, 1 - x);
  const h = Math.min(raw.h as number, 1 - y);
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** A v2 section calibration parsed into the viewer's placement form. */
export interface SectionPlacement extends DrawingPlacement {
  plane: SectionPlane;
}

/** Placement of a vertical (section) underlay: carries `plane`. */
export function isSectionPlacement(p: DrawingPlacement | null | undefined): p is SectionPlacement {
  return !!p && !!(p as { plane?: unknown }).plane;
}

function calibrationPairs(raw: unknown): PlacementCalibrationPair[] {
  if (!Array.isArray(raw)) return [];
  const out: PlacementCalibrationPair[] = [];
  for (const c of raw) {
    if (!isObj(c)) continue;
    const pdf = c.pdf_pt;
    const model = c.ifc_m ?? c.model_m;
    if (Array.isArray(pdf) && pdf.length === 2 && pdf.every(isNum) && Array.isArray(model) && model.length === 2 && model.every(isNum)) {
      out.push({ pdfPt: [pdf[0], pdf[1]], ifcM: [model[0], model[1]] });
    }
  }
  return out;
}

/**
 * One `georefV2.calibrations[]` entry with a `plane` -> section placement.
 * Entries without a plane (floor plans) return null: the viewer reads plans
 * from the v1 `_georef` as before.
 */
export function parseSectionCalibration(raw: unknown): SectionPlacement | null {
  if (!isObj(raw)) return null;
  const plane = parseSectionPlane(raw.plane);
  if (!plane) return null;
  const page = raw.page ?? 1;
  if (!isNum(page) || !Number.isInteger(page) || page < 1) return null;
  const size = raw.page_size;
  if (!Array.isArray(size) || size.length !== 2 || !size.every(isNum) || size[0] <= 0 || size[1] <= 0) return null;
  const a = raw.affine;
  if (!Array.isArray(a) || a.length !== 6 || !a.every(isNum)) return null;
  const storeyGuid = typeof raw.storey_guid === 'string' ? raw.storey_guid : '';
  return {
    version: 1,
    storeyGuid,
    storeyZ: isNum(raw.storey_z) ? raw.storey_z : plane.origin[2],
    page,
    pageSize: [size[0], size[1]],
    affine: [a[0], a[1], a[2], a[3], a[4], a[5]] as Affine2x3,
    calibration: calibrationPairs(raw.calibration),
    opacity: isNum(raw.opacity) ? clamp01(raw.opacity) : DEFAULT_UNDERLAY_OPACITY,
    visible: typeof raw.visible === 'boolean' ? raw.visible : true,
    discipline: typeof raw.discipline === 'string' ? raw.discipline : null,
    calibratedAt: typeof raw.calibrated_at === 'string' ? raw.calibrated_at : null,
    plane,
    region: parsePageRegion(raw.region),
    source: typeof raw.source === 'string' ? raw.source : null,
  };
}

/** Section calibrations of a `georefV2` value, with their index in `calibrations[]`. */
export function parseGeorefV2Sections(raw: unknown): { index: number; placement: SectionPlacement }[] {
  if (!isObj(raw) || !Array.isArray(raw.calibrations)) return [];
  const out: { index: number; placement: SectionPlacement }[] = [];
  raw.calibrations.forEach((entry, index) => {
    const placement = parseSectionCalibration(entry);
    if (placement) out.push({ index, placement });
  });
  return out;
}

/**
 * Section placement -> v2 calibration entry for `UNDERLAY_SAVE`. `base` is the
 * entry as the host sent it: fields the viewer does not model (quality, mark,
 * history...) are kept, the viewer's fields replace theirs.
 */
export function serializeSectionCalibration(p: SectionPlacement, base: Raw = {}, source?: string | null): Raw {
  const out: Raw = {
    ...base,
    version: 2,
    page: p.page,
    page_size: [p.pageSize[0], p.pageSize[1]],
    affine: [...p.affine],
    plane: { origin: [...p.plane.origin], u: [...p.plane.u], v: [...p.plane.v] },
    opacity: p.opacity,
    visible: p.visible,
    discipline: p.discipline,
    calibrated_at: p.calibratedAt,
  };
  if (p.storeyGuid) out.storey_guid = p.storeyGuid;
  if (p.region) out.region = { ...p.region };
  const src = source ?? (typeof base.source === 'string' ? base.source : p.source);
  if (src) out.source = src;
  return out;
}

/** Page point -> IFC point on the section plane. */
export function sectionPageToIfc(p: SectionPlacement, page: { x: number; y: number }): [number, number, number] {
  const st = applyAffine(p.affine, page);
  const { origin: o, u, v } = p.plane;
  return [o[0] + st.x * u[0] + st.y * v[0], o[1] + st.x * u[1] + st.y * v[1], o[2] + st.x * u[2] + st.y * v[2]];
}

/** Lift off the cut faces, as `DEFAULT_PLANE_LIFT` of a floor plan. */
const SECTION_LIFT = 0.05;

/** IFC point -> viewer world, the frame of `ifcToWorld`. */
const toWorld = (q: readonly number[], o: Vec3): Vec3 => ({ x: q[0] - o.x, y: q[2] - o.y, z: -q[1] - o.z });

/** IFC direction -> viewer world direction (the axis swap of `ifcToWorld`, no offset). */
const dirToWorld = (d: readonly number[]): Vec3 => ({ x: d[0], y: d[2], z: -d[1] });

/**
 * World quad of a section underlay: the page (or its region) on the plane,
 * moved `lift` metres along `u x v` so it does not z-fight with the cut faces.
 * `normal` (world) is the reading side; `uv` the texture window of the region.
 */
export function sectionWorldCorners(p: SectionPlacement, offset: Vec3, lift: number = SECTION_LIFT): PlacementCorners {
  const [w, h] = p.pageSize;
  const r = p.region ?? { x: 0, y: 0, w: 1, h: 1 };
  const n = cross(p.plane.u, p.plane.v);
  const nl = length(n);
  const k = lift / nl;
  const corner = (fx: number, fy: number): Vec3 => {
    const q = sectionPageToIfc(p, { x: fx * w, y: (1 - fy) * h });
    return toWorld([q[0] + n[0] * k, q[1] + n[1] * k, q[2] + n[2] * k], offset);
  };
  return {
    tl: corner(r.x, r.y),
    tr: corner(r.x + r.w, r.y),
    br: corner(r.x + r.w, r.y + r.h),
    bl: corner(r.x, r.y + r.h),
    planeY: p.plane.origin[2] - offset.y,
    normal: dirToWorld([n[0] / nl, n[1] / nl, n[2] / nl]),
    uv: { u0: r.x, v0: r.y, u1: r.x + r.w, v1: r.y + r.h },
  };
}
