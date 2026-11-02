/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Rozumný rezný box (AIM, inšpirácia "Box cut"): okraj podľa veľkosti výberu a
 * pre miestnosť (IfcSpace) box od spodku podlahovej dosky po vrch stropnej
 * dosky, vodorovne obálka + hrúbka okolitých stien, aby bolo vidieť skladby.
 * Čistá matematika v render rámci (Y hore, metre); zber prvkov zo scény je v
 * `sectionBoxScene.ts`. Čo dáta nedajú, padne na obálku s okrajom (po stranách).
 */

type V3 = { x: number; y: number; z: number };
export type FitBox = { min: V3; max: V3 };
export type FitKind = 'slab' | 'wall';
export interface FitCandidate extends FitBox { kind: FitKind }

/** Okraj = 20 % najdlhšej strany: stôl či stĺp dostane ~0,3 m, izba ~1 m, celé podlažie sa zastaví na strope. */
export const MARGIN_FRACTION = 0.2;
/** Pod 0,3 m by okraj neukázal okolie ani u malého prvku (dvere, okno), nad 2 m už zaberá pol budovy. */
export const MARGIN_MIN_M = 0.3;
export const MARGIN_MAX_M = 2;
/** Doska pod/nad miestnosťou sa môže s jej obálkou míňať o ~0,3 m (modelovanie od povrchu). */
const SLAB_GAP_M = 0.3;
/** Vrch podlahovej dosky leží pod spodkom miestnosti najviac o toľko (podlahová skladba nad doskou). */
const SLAB_BELOW_M = 0.4;
/** Stena sa počíta, keď jej vnútorná plocha leží do 0,1 m od obálky miestnosti. */
const WALL_GAP_M = 0.1;
/** Hrubšia "stena" je skôr masív či model bez skladby: nepoužiť ju na rozšírenie. */
const WALL_MAX_THICKNESS_M = 0.8;
/** Doska/stena sa musí s miestnosťou prekrývať aspoň takto (m), nie len dotýkať. */
const OVERLAP_MIN_M = 0.1;

const size = (b: FitBox): V3 => ({ x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z });
const finite = (b: FitBox) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite);

/** Okraj pre výber s obálkou `bounds`; 0 pre nezmyselný vstup. */
export function autoMarginM(bounds: FitBox): number {
  if (!finite(bounds)) return 0;
  const s = size(bounds);
  const longest = Math.max(s.x, s.y, s.z);
  return Math.min(MARGIN_MAX_M, Math.max(MARGIN_MIN_M, longest * MARGIN_FRACTION));
}

/** Obálka zväčšená o `margin` na každú stranu (alebo o automatický okraj). */
export function boxAround(bounds: FitBox, margin?: number): FitBox | null {
  if (!finite(bounds)) return null;
  const m = margin ?? autoMarginM(bounds);
  return {
    min: { x: bounds.min.x - m, y: bounds.min.y - m, z: bounds.min.z - m },
    max: { x: bounds.max.x + m, y: bounds.max.y + m, z: bounds.max.z + m },
  };
}

const overlap = (aMin: number, aMax: number, bMin: number, bMax: number) => Math.min(aMax, bMax) - Math.max(aMin, bMin);
const overlapsFootprint = (a: FitBox, b: FitBox) =>
  overlap(a.min.x, a.max.x, b.min.x, b.max.x) >= OVERLAP_MIN_M && overlap(a.min.z, a.max.z, b.min.z, b.max.z) >= OVERLAP_MIN_M;

/**
 * Box miestnosti: zvisle od spodku podlahovej dosky pod ňou po vrch stropnej
 * dosky nad ňou, vodorovne obálka + hrúbka stien, ktoré ju ohraničujú. Strana,
 * na ktorej dáta chýbajú (bez dosky, bez steny), dostane okraj `fallbackMargin`.
 * `found` hovorí, ktoré strany sa podarilo spresniť (pre test a hlásenie).
 */
export function sectionBoxForSpace(space: FitBox, candidates: readonly FitCandidate[], fallbackMargin?: number): { box: FitBox; found: SideFound } | null {
  if (!finite(space)) return null;
  const margin = fallbackMargin ?? autoMarginM(space);
  const min: V3 = { ...space.min };
  const max: V3 = { ...space.max };
  const found: SideFound = { minX: false, maxX: false, minY: false, maxY: false, minZ: false, maxZ: false };

  // Zvisle: najbližšia doska pod (jej vrch pri spodku miestnosti) a nad (jej spodok pri strope).
  let floorBottom: number | null = null;
  let floorTop = -Infinity;
  let ceilTop: number | null = null;
  let ceilBottom = Infinity;
  for (const c of candidates) {
    if (c.kind !== 'slab' || !overlapsFootprint(space, c)) continue;
    if (c.max.y <= space.min.y + SLAB_GAP_M && c.max.y >= space.min.y - SLAB_BELOW_M && c.max.y > floorTop) {
      floorTop = c.max.y;
      floorBottom = c.min.y;
    }
    if (c.min.y >= space.max.y - SLAB_GAP_M && c.min.y <= space.max.y + SLAB_GAP_M && c.min.y < ceilBottom) {
      ceilBottom = c.min.y;
      ceilTop = c.max.y;
    }
  }
  if (floorBottom !== null) { min.y = Math.min(min.y, floorBottom); found.minY = true; }
  if (ceilTop !== null) { max.y = Math.max(max.y, ceilTop); found.maxY = true; }

  // Vodorovne: stena tenká v X (alebo v Z) ohraničuje miestnosť na tej strane; rozšír o jej hrúbku.
  for (const c of candidates) {
    if (c.kind !== 'wall') continue;
    const s = size(c);
    if (overlap(space.min.y, space.max.y, c.min.y, c.max.y) < OVERLAP_MIN_M) continue;
    const thinX = s.x <= s.z;
    const t = thinX ? s.x : s.z;
    if (t > WALL_MAX_THICKNESS_M) continue;
    if (thinX) {
      if (overlap(space.min.z, space.max.z, c.min.z, c.max.z) < OVERLAP_MIN_M) continue;
      if (Math.abs(c.max.x - space.min.x) <= WALL_GAP_M) { min.x = Math.min(min.x, c.min.x); found.minX = true; }
      else if (Math.abs(c.min.x - space.max.x) <= WALL_GAP_M) { max.x = Math.max(max.x, c.max.x); found.maxX = true; }
    } else {
      if (overlap(space.min.x, space.max.x, c.min.x, c.max.x) < OVERLAP_MIN_M) continue;
      if (Math.abs(c.max.z - space.min.z) <= WALL_GAP_M) { min.z = Math.min(min.z, c.min.z); found.minZ = true; }
      else if (Math.abs(c.min.z - space.max.z) <= WALL_GAP_M) { max.z = Math.max(max.z, c.max.z); found.maxZ = true; }
    }
  }

  if (!found.minX) min.x -= margin;
  if (!found.maxX) max.x += margin;
  if (!found.minY) min.y -= margin;
  if (!found.maxY) max.y += margin;
  if (!found.minZ) min.z -= margin;
  if (!found.maxZ) max.z += margin;
  return { box: { min, max }, found };
}

export interface SideFound { minX: boolean; maxX: boolean; minY: boolean; maxY: boolean; minZ: boolean; maxZ: boolean }
