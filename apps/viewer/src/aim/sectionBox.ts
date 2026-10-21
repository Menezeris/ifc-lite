/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Rezný box z chatu (AIM D-132): pohľad je orez, rovina alebo box (#165,
 * "Výstuž stĺpa S12"). `SET_SECTION_BOX` nastaví box upstreamu
 * (`setSectionBox`, #5513) okolo obálky prvkov s okrajom, alebo na presnú
 * obálku v IFC svete (obnova uloženého pohľadu D-122). `view_state.section.box`
 * ho vráti v IFC svete. Nič nové nepočíta: obálky sú tie isté ako pri rezoch
 * cez prvok (`viewQueries.ts`). Protokol je tu, vykonanie lenivo v `applySectionBox`.
 */

import { SOURCE } from './bridge-protocol.js';

type Vec3Wire = { x: number; y: number; z: number };

export interface SectionBoxMessage {
  source: typeof SOURCE;
  type: 'SET_SECTION_BOX';
  /** Box okolo obálky týchto prvkov (+ `marginM` na každú stranu). */
  guids?: string[];
  marginM?: number;
  /** Presná obálka v IFC svete (Z hore, m). */
  box?: { min: Vec3Wire; max: Vec3Wire };
}

const MAX_GUIDS = 100;
export const BOX_MARGIN_RANGE = { min: 0, max: 20 } as const;
const LIMIT = 1e7;
const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isVec = (v: unknown): v is Vec3Wire => {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p === 'object' && num(p.x, -LIMIT, LIMIT) && num(p.y, -LIMIT, LIMIT) && num(p.z, -LIMIT, LIMIT);
};

export function isSectionBoxMessage(data: unknown): data is SectionBoxMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  if (m.source !== SOURCE || m.type !== 'SET_SECTION_BOX') return false;
  const byGuids = Array.isArray(m.guids) && m.guids.length > 0 && m.guids.length <= MAX_GUIDS
    && m.guids.every((g) => typeof g === 'string' && g.length > 0);
  const box = m.box as { min?: unknown; max?: unknown } | undefined;
  const byBox = !!box && typeof box === 'object' && isVec(box.min) && isVec(box.max)
    && box.min.x < box.max.x && box.min.y < box.max.y && box.min.z < box.max.z;
  if (byGuids === byBox) return false; // práve jeden cieľ
  return m.marginM === undefined || (byGuids && num(m.marginM, BOX_MARGIN_RANGE.min, BOX_MARGIN_RANGE.max));
}

/** Render-rámcový box -> `SectionBox` upstreamu (polia [x, y, z]), s okrajom. */
export function toSectionBox(box: { min: Vec3Wire; max: Vec3Wire }, margin = 0) {
  return {
    min: [box.min.x - margin, box.min.y - margin, box.min.z - margin] as [number, number, number],
    max: [box.max.x + margin, box.max.y + margin, box.max.z + margin] as [number, number, number],
  };
}

/** IFC svet -> render rámec mení poradie a znamienko osí: rohy sa po prevode znovu zoradia. */
export function orderedBox(a: Vec3Wire, b: Vec3Wire): { min: Vec3Wire; max: Vec3Wire } {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}
