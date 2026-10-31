/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zvislé podklady rezov (REZ-A, REZ-B) z `georefV2.calibrations[]` (AIMviewer #284, D-179).
 *
 * Host posiela pri dokumente (UNDERLAYS_LOAD aj DOCUMENTS_LOAD) `georefV2`; položka s `plane`
 * je zvislý podklad jednej strany. Viewer ju drží v tom istom store ako pôdorys (`underlayDrawings`),
 * takže 3D, `visible`, `opacity`, `SET_UNDERLAYS_3D` a uložené pohľady (D-168) idú rovnakou cestou.
 * Kľúč v store: id dokumentu, ak má dokument jednu kalibráciu rezu, inak `id#index` (index
 * v `calibrations[]`); na drôte je vždy skutočné id dokumentu (`documentOf`).
 * Dokument s rezom sa nekreslí ako pôdorys (v1 `_georef` takého dokumentu sa ignoruje).
 */

import {
  isSectionPlacement,
  parseGeorefV2Sections,
  serializeSectionCalibration,
  type DrawingPlacement,
  type SectionPlacement,
} from '@ifc-lite/drawing-underlay';

/** Dokument z drôtu, ako ho nesie UNDERLAYS_LOAD alebo DOCUMENTS_LOAD (pdfUrl / url). */
export interface SectionSourceDoc {
  documentId: string;
  name: string;
  pdfUrl: string;
  georefV2?: unknown;
  georef?: unknown;
}

/** Jedna kalibrácia rezu ako záznam store plus odkaz na položku hosta. */
export interface SectionEntry {
  id: string;
  documentId: string;
  /** Index v `georefV2.calibrations[]`. */
  index: number;
  name: string;
  pdfUrl: string;
  placement: SectionPlacement;
  /** Položka hosta, ako prišla: polia, ktoré viewer nepozná, idú pri uložení späť. */
  raw: Record<string, unknown>;
}

/** Záznam store (`UnderlayDrawing`) bez závislosti na store. */
export interface UnderlayLike {
  id: string;
  name: string;
  pdfUrl: string;
  placement: DrawingPlacement | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** `georefV2` dokumentu; hosť ho môže poslať aj ako `georef` s `calibrations[]` (version 2). */
function georefV2Of(d: SectionSourceDoc): unknown {
  if (d.georefV2 !== undefined) return d.georefV2;
  return isObj(d.georef) && Array.isArray(d.georef.calibrations) ? d.georef : undefined;
}

/** Kalibrácie rezov dokumentov z drôtu. */
export function sectionEntries(docs: readonly SectionSourceDoc[]): SectionEntry[] {
  const out: SectionEntry[] = [];
  for (const d of docs) {
    const v2 = georefV2Of(d);
    const sections = parseGeorefV2Sections(v2);
    if (sections.length === 0) continue;
    const list = (v2 as { calibrations: unknown[] }).calibrations;
    sections.forEach(({ index, placement }, k) => {
      const many = sections.length > 1;
      out.push({
        id: many ? `${d.documentId}#${index}` : d.documentId,
        documentId: d.documentId,
        index,
        name: many ? `${d.name} (${k + 1}, s. ${placement.page})` : d.name,
        pdfUrl: d.pdfUrl,
        placement,
        raw: isObj(list[index]) ? { ...(list[index] as Record<string, unknown>) } : {},
      });
    });
  }
  return out;
}

/**
 * Zoznam pre store: podklady z UNDERLAYS_LOAD a rezy. Dokument s rezom nahradí svoj záznam
 * pôdorysu (rez nemá pôdorys); rez z DOCUMENTS_LOAD sa pridá, aj keď dokument v UNDERLAYS_LOAD nie je.
 */
export function mergeSectionUnderlays(base: readonly UnderlayLike[], sections: readonly SectionEntry[]): UnderlayLike[] {
  const sectionDocs = new Set(sections.map((s) => s.documentId));
  const out: UnderlayLike[] = base.filter((d) => !sectionDocs.has(d.id));
  const seen = new Set(out.map((d) => d.id));
  for (const s of sections) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, name: s.name, pdfUrl: s.pdfUrl, placement: s.placement });
  }
  return out;
}

/** Rezy z UNDERLAYS_LOAD majú prednosť pred tými istými z DOCUMENTS_LOAD (podľa id záznamu). */
export function combineSections(fromUnderlays: readonly SectionEntry[], fromDocuments: readonly SectionEntry[]): SectionEntry[] {
  const docs = new Set(fromUnderlays.map((s) => s.documentId));
  return [...fromUnderlays, ...fromDocuments.filter((s) => !docs.has(s.documentId))];
}

const sameGeometry = (a: SectionPlacement, b: SectionPlacement) =>
  a.page === b.page
  && a.affine.every((x, i) => x === b.affine[i])
  && JSON.stringify(a.plane) === JSON.stringify(b.plane)
  && JSON.stringify(a.region ?? null) === JSON.stringify(b.region ?? null);

/** `UNDERLAY_SAVE` rezu: poloha zmenená vo vieweri = `source: manual`, len visible / opacity zdroj nemení. */
export interface SectionSave {
  documentId: string;
  page: number;
  calibrationIndex: number;
  georef: Record<string, unknown>;
}

export function sectionSave(entry: SectionEntry, placement: DrawingPlacement): SectionSave | null {
  if (!isSectionPlacement(placement)) return null;
  const moved = !sameGeometry(entry.placement, placement);
  return {
    documentId: entry.documentId,
    page: placement.page,
    calibrationIndex: entry.index,
    georef: serializeSectionCalibration(placement, entry.raw, moved ? 'manual' : undefined),
  };
}

/** Rezy poslednej relácie mosta; `documentOf` a uloženie podľa kľúča store. */
const registry = new Map<string, SectionEntry>();

/**
 * Lokálne uložený posun, ktorý host ešte nepotvrdil: `stale` sú polohy pred posunom (host ich môže
 * poslať znova, kým PATCH nedobehne), `entry` je posledný uložený stav.
 */
const pending = new Map<string, { stale: SectionPlacement[]; entry: SectionEntry }>();

/**
 * Nastaví register z rezov hosta. Lokálne uložený posun vydrží, kým host nepošle rovnakú polohu
 * (potvrdenie) alebo inú ako pôvodnú (novší stav hosta): vtedy ho nahradí stav hosta. Poloha rovná
 * staršej (pred posunom) znamená, že host ešte nestihol uložiť, a posun ostane. Vráti rezy pre store.
 */
export function setSectionRegistry(entries: readonly SectionEntry[]): SectionEntry[] {
  const out: SectionEntry[] = [];
  registry.clear();
  for (const e of entries) {
    const p = pending.get(e.id);
    let use = e;
    if (p) {
      if (p.stale.some((s) => sameGeometry(s, e.placement)) && !sameGeometry(p.entry.placement, e.placement)) use = p.entry;
      else pending.delete(e.id);
    }
    registry.set(use.id, use);
    out.push(use);
  }
  for (const id of [...pending.keys()]) if (!registry.has(id)) pending.delete(id);
  return out;
}

export const sectionEntry = (id: string): SectionEntry | undefined => registry.get(id);

/** Po uložení je nová poloha základom ďalšieho porovnania (druhá úprava je tiež `manual`). */
export function rememberSectionSave(id: string, placement: SectionPlacement, georef: Record<string, unknown>): void {
  const e = registry.get(id);
  if (!e) return;
  const next = { ...e, placement, raw: georef };
  registry.set(id, next);
  const stale = pending.get(id)?.stale ?? [];
  pending.set(id, { stale: [...stale, e.placement], entry: next });
}

/** Test: zabudnúť všetko (register aj nepotvrdené posuny). */
export function resetSectionRegistry(): void {
  registry.clear();
  pending.clear();
}

/** Skutočné id dokumentu záznamu store (pôdorys: id samo). */
export const documentOf = (id: string): string => registry.get(id)?.documentId ?? id;
