/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bridge správy pohľadu (AIM D-083 fáza 1): rez, kamera, režim 3D|2D|Split.
 * Host nepozná súradnice scény, preto správy nesú len podlažie (IFC GlobalId),
 * výšku nad jeho úrovňou, preset kamery a GUIDy cieľa - prepočet na rovinu a
 * kameru robí viewer (`viewCommands.ts`). Vlastný súbor, lebo
 * `bridge-protocol.ts` je na rozpočte veľkosti modulu.
 *
 * Spätný kanál (AIM D-085): `QUERY` sa pýta na obálky prvkov a modelu alebo na
 * stav pohľadu, viewer odpovie `QUERY_RESULT` s tým istým `id`. Súradnice v
 * odpovedi aj `coordinate` v `SET_SECTION` sú IFC svet (Z hore, metre), aby
 * jedna pravda o súradniciach ostala vo vieweri.
 */

import { SOURCE } from './bridge-protocol.js';

export const CAMERA_PRESETS = ['top', 'bottom', 'front', 'back', 'left', 'right', 'iso', 'fit_all'] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];
export const VIEW_MODES = ['3d', '2d', 'split'] as const;
export type BridgeViewMode = (typeof VIEW_MODES)[number];
export type SectionAxis = 'x' | 'y' | 'z';
/** Rez cez prvok: pozdĺž / naprieč jeho dlhšej vodorovnej osi (zvislý), alebo stredom na danej osi. */
export const SECTION_FITS = ['along', 'across', 'center'] as const;
export type SectionFit = (typeof SECTION_FITS)[number];
export const VIEW_QUERIES = ['bounds', 'view_state'] as const;
export type ViewQuery = (typeof VIEW_QUERIES)[number];

/** Výška rezu nad úrovňou podlažia v metroch - rovnaký rozsah ako host. */
export const SECTION_OFFSET_RANGE = { min: -5, max: 20 } as const;
const MAX_GUIDS = 600;
/** Obálky sa vracajú po prvkoch, preto menej než pri ofarbení. */
export const MAX_QUERY_GUIDS = 100;

export type ViewInboundMessage =
  | {
      source: typeof SOURCE;
      type: 'SET_SECTION';
      action: 'set' | 'clear';
      axis?: SectionAxis;
      storeyGuid?: string;
      offsetM?: number;
      position?: number;
      /** Rez cez obálku týchto prvkov (`fit` along/across zvolí zvislú os sám). */
      guids?: string[];
      fit?: SectionFit;
      /** Poloha roviny v IFC svete (m) na osi rezu: x = IFC X, y = IFC Z (výška), z = IFC Y. */
      coordinate?: number;
      flipped?: boolean;
    }
  | { source: typeof SOURCE; type: 'SET_CAMERA'; preset: CameraPreset; projection?: 'perspective' | 'orthographic'; guids?: string[] }
  | { source: typeof SOURCE; type: 'SET_VIEW_MODE'; mode: BridgeViewMode; storeyGuid?: string }
  | { source: typeof SOURCE; type: 'QUERY'; id: string; query: ViewQuery; guids?: string[] };

/** Odpoveď viewera na `QUERY` (viewer -> host). */
export type ViewQueryResult =
  | { source: typeof SOURCE; type: 'QUERY_RESULT'; id: string; ok: true; result: unknown }
  | { source: typeof SOURCE; type: 'QUERY_RESULT'; id: string; ok: false; error: string };

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const inRange = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const optional = <T>(v: T | undefined, ok: (x: T) => boolean) => v === undefined || ok(v);

function isGuidList(v: unknown, max = MAX_GUIDS): v is string[] {
  return Array.isArray(v) && v.length <= max && v.every(isStr);
}

const isAxis = (v: unknown) => v === 'x' || v === 'y' || v === 'z';
const isId = (v: unknown) => isStr(v) && v.length <= 64;

export function isViewMessage(data: unknown): data is ViewInboundMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  if (m.source !== SOURCE) return false;
  switch (m.type) {
    case 'SET_SECTION': {
      if (m.action === 'clear') return true;
      if (m.action !== 'set') return false;
      if (!optional(m.flipped, (f) => typeof f === 'boolean')) return false;
      if (isStr(m.storeyGuid)) {
        // Rez nad podlažím je vždy vodorovný.
        return (m.axis === undefined || m.axis === 'y')
          && optional(m.offsetM, (o) => inRange(o, SECTION_OFFSET_RANGE.min, SECTION_OFFSET_RANGE.max));
      }
      if (m.guids !== undefined) {
        // along/across si os zvolí podľa obálky; stredom treba os povedať.
        if (!isGuidList(m.guids, MAX_QUERY_GUIDS) || m.guids.length === 0) return false;
        if (m.fit === 'along' || m.fit === 'across') return m.axis === undefined;
        return (m.fit === undefined || m.fit === 'center') && isAxis(m.axis);
      }
      if (m.coordinate !== undefined) return isAxis(m.axis) && inRange(m.coordinate, -1e7, 1e7);
      return isAxis(m.axis) && inRange(m.position, 0, 100);
    }
    case 'SET_CAMERA':
      return (CAMERA_PRESETS as readonly unknown[]).includes(m.preset)
        && optional(m.projection, (p) => p === 'perspective' || p === 'orthographic')
        && optional(m.guids, isGuidList);
    case 'SET_VIEW_MODE':
      return (VIEW_MODES as readonly unknown[]).includes(m.mode) && optional(m.storeyGuid, isStr);
    case 'QUERY':
      return isId(m.id)
        && (VIEW_QUERIES as readonly unknown[]).includes(m.query)
        && optional(m.guids, (g) => isGuidList(g, MAX_QUERY_GUIDS));
    default:
      return false;
  }
}
