/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výber IFC prvkov pod oblasťou pripomienky na PDF (AIM #199 bod 2, D-158): čistá logika bez
 * store a DOM. Oblasť strany (zlomky, vľavo hore) sa cez kalibráciu strany (`_georef`, affine
 * strana v bodoch -> IFC metre) prevedie na štvoruholník v pôdoryse IFC a prvky sa vyberú podľa
 * obálky (AABB) v pásme výšok podlažia. Je to návrh pre človeka (obálka je hrubšia než trojuholníky
 * meshu, ktoré použije `bcf_topic locate` v hoste): vybrané prvky idú ako komponenty témy.
 * Zvislý rez (`plane`) a strana bez kalibrácie návrh nedajú, tam sa vyberá ručne v 3D.
 */

import { applyAffine, type Affine2x3 } from '@ifc-lite/drawing-underlay';
import type { IssueRegion } from './docIssueModel.js';

export interface PlanePoint {
  x: number;
  y: number;
}

/** Umiestnenie pôdorysnej strany, čo návrh potrebuje (podmnožina `DrawingPlacement`). */
export interface EntityPlacement {
  affine: Affine2x3;
  /** Veľkosť strany v bodoch PDF `[šírka, výška]`. */
  pageSize: [number, number];
  /** Výška podlažia (IFC Z, m). */
  storeyZ: number;
  /** Zvislý rez: pôdorysný návrh nemá zmysel. */
  plane?: unknown;
}

/** Prvok modelu s obálkou v IFC metroch (Z hore). */
export interface EntityBox {
  guid: string;
  ifcType: string;
  name: string;
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface EntityCandidate {
  guid: string;
  ifcType: string;
  name: string;
  /** Vzdialenosť stredu prvku od stredu oblasti (m), na zoradenie. */
  distance: number;
}

/** Najviac prvkov v návrhu (zoznam v karte a strop `components` témy). */
export const MAX_CANDIDATES = 200;
/** Do tohto počtu sa prvky navrhnú ako označené, nad ním ich človek označí sám. */
export const PRESELECT_MAX = 25;
/** Výška pásma, ak nad podlažím nie je ďalšie (m). */
export const DEFAULT_STOREY_HEIGHT = 4;
/** Prvok musí do pásma zasahovať aspoň toľko (m): doska pod podlahou a strop hore nie. */
const BAND_MIN = 0.1;

/** Triedy, ktoré nie sú prvky pre pripomienku (host ich z návrhu tiež vynecháva). */
const SKIP_CLASSES = new Set([
  'IFCSPACE', 'IFCOPENINGELEMENT', 'IFCBUILDINGSTOREY', 'IFCBUILDING', 'IFCSITE', 'IFCPROJECT',
  'IFCGRID', 'IFCANNOTATION', 'IFCVIRTUALELEMENT', 'IFCZONE', 'IFCSPATIALZONE',
]);

/** Prvok s nerozpoznanym typom (prazdny retazec) ostava v zozname: vyradit ho ticho by ho skryl aj z poctu. */
export const isPickableClass = (ifcType: string | undefined): boolean => !SKIP_CLASSES.has((ifcType ?? '').toUpperCase());

/** Oblasť strany v zlomkoch (vľavo hore) -> štyri rohy v pôdoryse IFC (m); null = neplatné umiestnenie. */
export function regionToIfcPolygon(placement: EntityPlacement, region: IssueRegion | null): PlanePoint[] | null {
  const [w, h] = placement.pageSize;
  if (placement.plane || !(w > 0) || !(h > 0)) return null;
  const r = region ?? { x: 0, y: 0, w: 1, h: 1 };
  // Body PDF majú počiatok vľavo dole a y hore, zlomky regiónu vľavo hore.
  const corner = (fx: number, fy: number) => applyAffine(placement.affine, { x: fx * w, y: (1 - fy) * h });
  const poly = [corner(r.x, r.y), corner(r.x + r.w, r.y), corner(r.x + r.w, r.y + r.h), corner(r.x, r.y + r.h)];
  return poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ? poly : null;
}

function project(poly: readonly PlanePoint[], ax: number, ay: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of poly) {
    const d = p.x * ax + p.y * ay;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}

/** Prekrýva sa obdĺžnik obálky (pôdorys) s konvexným štvoruholníkom? (SAT, 6 osí) */
export function boxOverlapsPolygon(box: EntityBox, poly: readonly PlanePoint[]): boolean {
  const rect: PlanePoint[] = [
    { x: box.min.x, y: box.min.y }, { x: box.max.x, y: box.min.y },
    { x: box.max.x, y: box.max.y }, { x: box.min.x, y: box.max.y },
  ];
  const axes: [number, number][] = [[1, 0], [0, 1]];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny);
    if (len > 1e-9) axes.push([nx / len, ny / len]);
  }
  for (const [ax, ay] of axes) {
    const [a0, a1] = project(poly, ax, ay);
    const [b0, b1] = project(rect, ax, ay);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

/** Pásmo výšok podlažia: od podlahy po ďalšie vyššie podlažie (alebo štandardnú výšku). */
export function storeyBand(storeyZ: number, otherStoreyZs: readonly number[]): [number, number] {
  // Neznama vyska podlazia = prazdne pasmo (nic neprejde), nie [NaN, NaN], ktore by nevylucilo nic.
  if (!Number.isFinite(storeyZ)) return [Infinity, -Infinity];
  let next = Infinity;
  for (const z of otherStoreyZs) if (Number.isFinite(z) && z > storeyZ + 0.5 && z < next) next = z;
  return [storeyZ, Number.isFinite(next) ? next : storeyZ + DEFAULT_STOREY_HEIGHT];
}

/**
 * Prvky pod oblasťou: obálka zasahuje do pôdorysu oblasti aj do pásma podlažia (aspoň `BAND_MIN`),
 * zoradené podľa vzdialenosti od stredu oblasti, najviac `MAX_CANDIDATES`.
 */
export function entitiesUnderRegion(
  boxes: readonly EntityBox[],
  poly: readonly PlanePoint[],
  band: readonly [number, number],
): { candidates: EntityCandidate[]; total: number } {
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
  const hits: EntityCandidate[] = [];
  const seen = new Set<string>();
  for (const b of boxes) {
    if (!b.guid || seen.has(b.guid) || !isPickableClass(b.ifcType)) continue;
    if (b.max.z < band[0] + BAND_MIN || b.min.z > band[1] - BAND_MIN) continue;
    if (!boxOverlapsPolygon(b, poly)) continue;
    seen.add(b.guid);
    hits.push({
      guid: b.guid,
      ifcType: b.ifcType,
      name: b.name,
      distance: Math.hypot((b.min.x + b.max.x) / 2 - cx, (b.min.y + b.max.y) / 2 - cy),
    });
  }
  hits.sort((a, b) => a.distance - b.distance || a.guid.localeCompare(b.guid));
  return { candidates: hits.slice(0, MAX_CANDIDATES), total: hits.length };
}

/** Počet prvkov podľa IFC triedy (zostupne) pre súhrn nad zoznamom. */
export function countByClass(list: readonly EntityCandidate[]): { ifcType: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of list) counts.set(c.ifcType, (counts.get(c.ifcType) ?? 0) + 1);
  return [...counts].map(([ifcType, count]) => ({ ifcType, count })).sort((a, b) => b.count - a.count || a.ifcType.localeCompare(b.ifcType));
}

/** Ktoré prvky navrhnúť ako označené: všetky, ak ich je málo, inak nič. */
export function preselected(list: readonly EntityCandidate[]): Set<string> {
  return list.length <= PRESELECT_MAX ? new Set(list.map((c) => c.guid)) : new Set();
}

/** Zjednotenie GlobalId bez duplicít, v poradí `first` potom `more`, najviac `max`. */
export function mergeGuids(first: readonly string[], more: readonly string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of [...first, ...more]) {
    if (!g || seen.has(g)) continue;
    seen.add(g);
    out.push(g);
    if (out.length >= max) break;
  }
  return out;
}

/** Odkiaľ prvok v zozname pripomienky je: výber z 3D, podlažie výkresu alebo celý projekt. */
export type PickKind = 'selection' | 'storey' | 'project';

/** Ručne priradená entita pripomienky (okrem návrhu podľa obálok). */
export interface PickedEntity {
  guid: string;
  /** Názov na zobrazenie (meno entity, inak GlobalId). */
  label: string;
  kind: PickKind;
}

/** Priestorové korene: do `components` témy idú ako GlobalId, ale v 3D sa nevyberajú (nemajú geometriu). */
const SPATIAL_ROOTS = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY']);
export const isSpatialRoot = (ifcType: string | undefined): boolean => SPATIAL_ROOTS.has((ifcType ?? '').toUpperCase());

/** Pridá položky na koniec zoznamu bez duplicít podľa GlobalId (prvá vyhráva), najviac `max`. */
export function addPicked(list: readonly PickedEntity[], items: readonly PickedEntity[], max: number): PickedEntity[] {
  const out: PickedEntity[] = [];
  const seen = new Set<string>();
  for (const p of [...list, ...items]) {
    if (!p.guid || seen.has(p.guid)) continue;
    seen.add(p.guid);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** Odstráni položku podľa GlobalId. */
export const removePicked = (list: readonly PickedEntity[], guid: string): PickedEntity[] => list.filter((p) => p.guid !== guid);
