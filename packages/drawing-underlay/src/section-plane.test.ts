/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';

import {
  isSectionPlacement,
  parseGeorefV2Sections,
  parseSectionCalibration,
  parseSectionPlane,
  sectionPageToIfc,
  serializeSectionCalibration,
  windingFlip,
} from './section-plane.js';
import { placementWorldCorners, ZERO_OFFSET } from './world-transform.js';

/** Rez A: rovina Y = 5 m, s po IFC +X, t = IFC Z; 1:100 (1 pt = 0.0254/72 m * 100). */
const K = (0.0254 / 72) * 100;
const ENTRY = {
  version: 2,
  page: 1,
  page_size: [1190, 842],
  affine: [K, 0, -2, 0, K, -1],
  plane: { origin: [0, 5, 0], u: [1, 0, 0], v: [0, 0, 1] },
  opacity: 0.5,
  visible: true,
  source: 'auto',
  calibrated_at: '2026-10-30T15:56:30.450Z',
  quality: { median_mm: 12 },
};

describe('section underlay from georefV2 (AIM #284, D-179)', () => {
  it('page point -> origin + s*u + t*v on the vertical plane', () => {
    const p = parseSectionCalibration(ENTRY)!;
    expect(isSectionPlacement(p)).toBe(true);
    const q = sectionPageToIfc(p, { x: 1000, y: 500 });
    expect(q[0]).toBeCloseTo(1000 * K - 2, 9);
    expect(q[1]).toBeCloseTo(5, 9);
    expect(q[2]).toBeCloseTo(500 * K - 1, 9);
  });

  it('world corners stand vertical on the plane, lifted along u x v, normal = u x v in world', () => {
    const p = parseSectionCalibration(ENTRY)!;
    const c = placementWorldCorners(p, ZERO_OFFSET, 0.05);
    // IFC (x, y, z) -> world (x, z, -y); u x v = (1,0,0) x (0,0,1) = (0,-1,0) -> world (0, 0, 1)
    expect(c.normal).toEqual({ x: 0, y: 0, z: 1 });
    for (const k of ['tl', 'tr', 'br', 'bl'] as const) expect(c[k].z).toBeCloseTo(-5 + 0.05, 9);
    expect(c.tl.y).toBeCloseTo(842 * K - 1, 9); // top of the page = highest
    expect(c.bl.y).toBeCloseTo(-1, 9);
    expect(c.tr.x).toBeCloseTo(1190 * K - 2, 9);
    expect(c.uv).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
  });

  it('a region crops the quad and the texture window to the same part of the page', () => {
    const p = parseSectionCalibration({ ...ENTRY, region: { x: 0.5, y: 0.25, w: 0.5, h: 0.5 } })!;
    const c = placementWorldCorners(p, ZERO_OFFSET, 0);
    expect(c.uv).toEqual({ u0: 0.5, v0: 0.25, u1: 1, v1: 0.75 });
    expect(c.tl.x).toBeCloseTo(595 * K - 2, 9);
    expect(c.tl.y).toBeCloseTo(0.75 * 842 * K - 1, 9);
  });

  it('a floor plan (no plane) keeps the horizontal quad and no normal', () => {
    const plan = { ...parseSectionCalibration(ENTRY)!, plane: undefined, region: undefined };
    const c = placementWorldCorners(plan, ZERO_OFFSET, 0);
    expect(c.normal).toBeUndefined();
    expect(c.tl.y).toBe(c.br.y);
  });

  it('winding flip: the strip (tl, tr, bl) faces -(u x v), a mirrored affine faces u x v', () => {
    const p = parseSectionCalibration(ENTRY)!;
    expect(windingFlip(placementWorldCorners(p, ZERO_OFFSET))).toBe(1);
    const mirrored = parseSectionCalibration({ ...ENTRY, affine: [K, 0, -2, 0, -K, 7] })!;
    expect(windingFlip(placementWorldCorners(mirrored, ZERO_OFFSET))).toBe(0);
    expect(windingFlip({ ...placementWorldCorners(p, ZERO_OFFSET), normal: undefined })).toBe(0);
  });

  it('rejects malformed planes: parallel, zero, non-finite; vectors as objects are fine', () => {
    expect(parseSectionPlane({ origin: [0, 0, 0], u: [1, 0, 0], v: [2, 0, 0] })).toBeNull();
    expect(parseSectionPlane({ origin: [0, 0, 0], u: [0, 0, 0], v: [0, 0, 1] })).toBeNull();
    expect(parseSectionPlane({ origin: [0, 0, NaN], u: [1, 0, 0], v: [0, 0, 1] })).toBeNull();
    expect(parseSectionPlane({ origin: { x: 1, y: 2, z: 3 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 } })?.origin).toEqual([1, 2, 3]);
    expect(parseSectionCalibration({ ...ENTRY, affine: [1, 2] })).toBeNull();
    expect(parseSectionCalibration({ ...ENTRY, page_size: [0, 1] })).toBeNull();
  });

  it('georefV2: only entries with a plane, with their index in calibrations[]', () => {
    const plan = { page: 1, page_size: [100, 100], affine: [1, 0, 0, 0, 1, 0], storey_guid: 'G' };
    const out = parseGeorefV2Sections({ calibrations: [plan, ENTRY, { junk: 1 }, { ...ENTRY, page: 2 }] });
    expect(out.map((s) => [s.index, s.placement.page])).toEqual([[1, 1], [3, 2]]);
    expect(parseGeorefV2Sections(null)).toEqual([]);
    expect(parseGeorefV2Sections({ calibrations: 'x' })).toEqual([]);
  });

  it('serialize keeps host fields, writes the viewer fields and the source', () => {
    const p = parseSectionCalibration(ENTRY)!;
    const out = serializeSectionCalibration({ ...p, opacity: 0.2 }, ENTRY);
    expect(out.quality).toEqual({ median_mm: 12 });
    expect(out.opacity).toBe(0.2);
    expect(out.source).toBe('auto');
    expect(out.plane).toEqual({ origin: [0, 5, 0], u: [1, 0, 0], v: [0, 0, 1] });
    expect(serializeSectionCalibration(p, { ...ENTRY, source: 'manual' }).source).toBe('manual');
    expect(serializeSectionCalibration(p, ENTRY, 'manual').source).toBe('manual');
    expect(parseSectionCalibration(out)).toEqual({ ...p, opacity: 0.2 });
  });
});
