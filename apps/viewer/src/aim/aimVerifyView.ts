/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Orez a kamera pri rozbalení overenia veličiny (AIM D-185 UI, pripomienka 2): čistá matematika v render rámci
 * (Y hore, vodorovné osi x a z), bez store a renderera; testuje `aimVerifyView.test.ts`.
 *
 * - výška (Height, FinishFloorHeight, FinishCeilingHeight): zvislý rez stredom miestnosti rovnobežne s jej dlhšou
 *   stranou, kamera vodorovne kolmo na rez, mierne zhora, perspektíva. Kóta je v strede pôdorysu, teda tesne za
 *   rovinou rezu: vidno ju celú, aj dosku pod a nad, podlahovinu a podhľad v reze. Ortografia zhora alebo z boku
 *   ukazuje steny zvonka a kótu skrátenú; perspektíva dáva hĺbku (Samuel 3. 11.).
 * - plocha a obvod: pôdorysný rez 1,2 m nad spodkom miestnosti (ako výkres), pohľad zhora, ortografia (plocha
 *   a obvod sa čítajú v skutočnej veľkosti).
 * - objem: "domček pre bábiky", rez stredom miestnosti ako pri výške, kamera zhora zo šikma (izometria), perspektíva:
 *   vidno celé teleso, podlahovinu aj podhľad, ktoré sa od objemu odpočítavajú.
 * Box je obálka miestnosti so skladbami (dosky a steny, `sectionBoxForSpace`), zvisle rozšírená o vstupné prvky.
 */

export type V3 = { x: number; y: number; z: number };
export interface Box { min: V3; max: V3 }
export type QuantityKind = 'height' | 'area' | 'perimeter' | 'volume' | 'other';
/** `a` = predvolený návrh, `b` = druhá možnosť pre Samuela (výška: ortografia, plocha: perspektíva zošikma). */
export type ViewOption = 'a' | 'b';

export interface VerifyViewPlan {
  kind: QuantityKind;
  /** Rezný box (render rámec). */
  box: Box;
  /** Smer od cieľa ku kamere (jednotkový). */
  dir: V3;
  up: V3;
  projection: 'perspective' | 'orthographic';
  /** Čo zarámovať (časť boxu, ktorú kamera vidí). */
  frame: Box;
}

/** Druh veličiny podľa mena (`Qto_SpaceBaseQuantities.FinishFloorHeight` -> výška). */
export function quantityKind(target: string): QuantityKind {
  const name = target.slice(target.lastIndexOf('.') + 1);
  if (/Height$/.test(name)) return 'height';
  if (/Area$/.test(name)) return 'area';
  if (/Perimeter$/.test(name)) return 'perimeter';
  if (/Volume$/.test(name)) return 'volume';
  return 'other';
}

/** Výška pôdorysného rezu nad spodkom miestnosti (ako výkres pôdorysu). */
export const PLAN_CUT_M = 1.2;
/** Rovina zvislého rezu je o toľko pred stredom miestnosti (kóta je v strede, ostane za rovinou). */
const SECTION_GAP_M = 0.05;
/** Okraj boxu za lícami skladieb (m). */
export const FACE_CLEARANCE_M = 0.05;
const HEIGHT_PITCH_DEG = 12;
const VOLUME_PITCH_DEG = 35;
const VOLUME_YAW_DEG = 35;
const PLAN_TILT_DEG = 40;

const AXES = ['x', 'y', 'z'] as const;

export function unionBox(boxes: readonly (Box | null | undefined)[]): Box | null {
  const ok = boxes.filter((b): b is Box => !!b && AXES.every((k) => Number.isFinite(b.min[k]) && Number.isFinite(b.max[k])));
  if (ok.length === 0) return null;
  const min = { ...ok[0].min };
  const max = { ...ok[0].max };
  for (const b of ok) for (const k of AXES) { min[k] = Math.min(min[k], b.min[k]); max[k] = Math.max(max[k], b.max[k]); }
  return { min, max };
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const rad = (deg: number) => (deg * Math.PI) / 180;
const unit = (axis: 'x' | 'z', sign: number): V3 => ({ x: axis === 'x' ? sign : 0, y: 0, z: axis === 'z' ? sign : 0 });

/**
 * Plán pohľadu. `room` = obálka miestnosti so skladbami (alebo samotná miestnosť), `body` = teleso miestnosti,
 * `inputs` = vstupné prvky (dosky, krytiny). `null`, keď niet obálky.
 */
export function verifyViewPlan(kind: QuantityKind, room: Box | null, body: Box | null, inputs: readonly Box[], option: ViewOption = 'a'): VerifyViewPlan | null {
  const core = body ?? room;
  const all = unionBox([room, body]);
  if (!core || !all) return null;
  // Vstupné prvky (doska cez celé podlažie, podlahovina) rozšíria box len zvisle; vodorovne ostane pôdorys miestnosti.
  for (const b of inputs) {
    if (!Number.isFinite(b.min.y) || !Number.isFinite(b.max.y)) continue;
    all.min.y = Math.min(all.min.y, b.min.y);
    all.max.y = Math.max(all.max.y, b.max.y);
  }
  // Steny boxu tesne za vonkajšími lícami stien a dosiek: rovina boxu presne na líci odreže lícnu plochu a renderer
  // ukáže vnútro prvku farbou rezu (celá miestnosť červená, overené naživo 3. 11.).
  for (const k of AXES) { all.min[k] -= FACE_CLEARANCE_M; all.max[k] += FACE_CLEARANCE_M; }
  // Rez rovnobežne s dlhšou stranou: kamera sa pozerá pozdĺž kratšej osi a vidí celú dĺžku miestnosti.
  const long: 'x' | 'z' = core.max.x - core.min.x >= core.max.z - core.min.z ? 'x' : 'z';
  const view: 'x' | 'z' = long === 'x' ? 'z' : 'x';
  const mid = (core.min[view] + core.max[view]) / 2;
  const cutAt = Math.max(all.min[view], mid - SECTION_GAP_M);
  const sectionBox: Box = { min: { ...all.min, [view]: cutAt }, max: { ...all.max } };
  const toCamera = unit(view, -1); // kamera na strane rezu
  const up: V3 = { x: 0, y: 1, z: 0 };

  if (kind === 'area' || kind === 'perimeter') {
    const top = Math.min(all.max.y, core.min.y + PLAN_CUT_M);
    const box: Box = { min: { ...all.min }, max: { ...all.max, y: top } };
    if (option === 'b') {
      const t = rad(PLAN_TILT_DEG);
      return { kind, box, dir: norm({ x: toCamera.x * Math.sin(t), y: Math.cos(t), z: toCamera.z * Math.sin(t) }), up, projection: 'perspective', frame: box };
    }
    // Pohľad zhora: "hore" na obrazovke je smer od kamery k rezu po kratšej osi, dlhšia strana ide vodorovne.
    return { kind, box, dir: { x: 0, y: 1, z: 0 }, up: unit(view, 1), projection: 'orthographic', frame: box };
  }
  if (kind === 'volume') {
    const p = rad(VOLUME_PITCH_DEG);
    const y = rad(VOLUME_YAW_DEG);
    const side = unit(long, 1);
    const h = Math.cos(p);
    const dir = norm({
      x: (toCamera.x * Math.cos(y) + side.x * Math.sin(y)) * h,
      y: Math.sin(p),
      z: (toCamera.z * Math.cos(y) + side.z * Math.sin(y)) * h,
    });
    // Strop tesne nad telesom miestnosti: doska nad by zakryla pohľad dnu, podhľad (vnútri telesa) ostane.
    const box: Box = { min: { ...sectionBox.min }, max: { ...sectionBox.max, y: Math.min(sectionBox.max.y, core.max.y + FACE_CLEARANCE_M) } };
    return { kind, box, dir, up, projection: 'perspective', frame: box };
  }
  // výška (aj neznámy druh): zvislý rez, kamera vodorovne kolmo naň
  if (option === 'b') return { kind, box: sectionBox, dir: toCamera, up, projection: 'orthographic', frame: sectionBox };
  const p = rad(HEIGHT_PITCH_DEG);
  const dir = norm({ x: toCamera.x * Math.cos(p), y: Math.sin(p), z: toCamera.z * Math.cos(p) });
  return { kind, box: sectionBox, dir, up, projection: 'perspective', frame: sectionBox };
}

/** Póza kamery pre `applyViewpoint`: cieľ v strede rámu, vzdialenosť podľa uhlopriečky (dorovná `frameBounds`). */
export function cameraPose(plan: VerifyViewPlan): { position: V3; target: V3; up: V3 } {
  const f = plan.frame;
  const target = { x: (f.min.x + f.max.x) / 2, y: (f.min.y + f.max.y) / 2, z: (f.min.z + f.max.z) / 2 };
  const d = Math.hypot(f.max.x - f.min.x, f.max.y - f.min.y, f.max.z - f.min.z) * 1.5 || 10;
  return {
    position: { x: target.x + plan.dir.x * d, y: target.y + plan.dir.y * d, z: target.z + plan.dir.z * d },
    target,
    up: plan.up,
  };
}
