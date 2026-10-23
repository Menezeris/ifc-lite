/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Uložený pohľad podlažia (AIM D-161) bez AIM metadát: pôdorys podlažia je obyčajný pohľad z
 * Presentation, ktorého vodorovný rez leží v rozsahu podlažia (od jeho úrovne po úroveň ďalšieho
 * vyššieho podlažia). `mode=2d floor=X` ho nájde odvodene a aktivuje; ak žiadny nie je, viewer len
 * nastaví kameru zhora a rez 1,2 m nad podlahou. Čistý výber bez store (test).
 */

export interface StoreyViewCandidate {
  id: string;
  name: string;
  /** Výšky vodorovných rezov pohľadu v IFC Z (m): povolené roviny osi `down`, bez boxu a vlastnej roviny. */
  cutZ: readonly number[];
}

export interface StoreyLevel { guid: string; name: string; elevation: number }

/** Úroveň najbližšieho vyššieho podlažia (m), alebo nekonečno pre najvyššie; rovnaké úrovne federácie sa preskočia. */
export function nextLevel(storeys: readonly StoreyLevel[], elevation: number): number {
  let next = Number.POSITIVE_INFINITY;
  for (const s of storeys) if (s.elevation > elevation && s.elevation < next) next = s.elevation;
  return next;
}

/** Je rez v rozsahu podlažia? Spodná hranica s tolerancou 1 cm (rez presne na podlahe patrí tomuto podlažiu). */
export function cutInStorey(z: number, elevation: number, above: number): boolean {
  return z >= elevation - 0.01 && z < above;
}

/**
 * Id pohľadu podlažia `guid`, alebo null. Viac zhôd: ten s menom podlažia (bez ohľadu na veľkosť písmen),
 * inak prvý v poradí Presentation.
 */
export function pickStoreyView(
  views: readonly StoreyViewCandidate[],
  storeys: readonly StoreyLevel[],
  guid: string,
): string | null {
  const storey = storeys.find((s) => s.guid === guid);
  if (!storey) return null;
  const above = nextLevel(storeys, storey.elevation);
  const hits = views.filter((v) => v.cutZ.some((z) => cutInStorey(z, storey.elevation, above)));
  if (hits.length <= 1) return hits[0]?.id ?? null;
  const name = storey.name.trim().toLowerCase();
  return (name ? hits.find((v) => v.name.toLowerCase().includes(name)) : undefined)?.id ?? hits[0].id;
}
