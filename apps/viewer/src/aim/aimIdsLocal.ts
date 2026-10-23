/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `view_state.ids_local` (D-162) ako čistá funkcia: IDS otvorené v Studiu a v paneli validácie, jeho kód
 * a verzia v AIM, či je upravené (`dirty`) a výsledky posledného behu po špecifikáciách. Vstup zbiera
 * `aimIdsStore.ts` zo store; tu nie je žiadny import runtime, aby sa dal logika skúšať bez viewera.
 */

/** Čo viewer vie o prepojení otvoreného IDS s AIM. Bez `code` ide o IDS, ktoré v AIM ešte nie je. */
export interface IdsSlot {
  code?: string;
  version?: number;
  /** Studio: `docId` otvoreného dokumentu; iný dokument = prepojenie zaniká. */
  docId?: string;
  /** Validácia: id položky knižnice definícií. */
  entryId?: string;
  /** XML v čase načítania alebo posledného uloženia; od neho sa počíta `dirty`. */
  baseline?: string;
}

/** Strop XML v `view_state` (nad ním len veľkosť; uloženie ide tlačidlom). */
export const MAX_LOCAL_XML = 256_000;
const MAX_LOCAL_SPECS = 60;

export interface LocalSpecResult {
  id: string;
  name: string;
  status: string;
  applicableCount: number;
  passedCount: number;
  failedCount: number;
}

export interface LocalReport {
  model?: string;
  summary: {
    totalSpecifications: number;
    passedSpecifications: number;
    failedSpecifications: number;
    totalEntitiesChecked: number;
    totalEntitiesPassed: number;
    totalEntitiesFailed: number;
  };
  specs: LocalSpecResult[];
}

export interface IdsLocalInput {
  slots: { studio: IdsSlot | null; validation: IdsSlot | null };
  /** Dokument v Studiu; `xml` je jeho aktuálny zápis (null = nedá sa zapísať alebo ešte nie je spočítaný). */
  studio: { docId: string; title: string; specs: number; xml: string | null } | null;
  /** IDS v paneli validácie: aktívna položka knižnice (`entryId`, `xml`) a posledný beh. */
  validation: {
    title: string;
    specs: number;
    entryId: string | null;
    xml: string | null;
    identifiers: ReadonlyMap<string, string | undefined>;
    report: LocalReport | null;
  } | null;
}

const link = (slot: IdsSlot | null, linked: boolean) => (linked && slot?.code ? { code: slot.code, version: slot.version } : {});

function xmlPart(xml: string | null, withXml: boolean) {
  if (xml === null) return {};
  return { bytes: xml.length, ...(withXml ? (xml.length <= MAX_LOCAL_XML ? { xml } : { xml_truncated: true }) : {}) };
}

function resultsOf(report: LocalReport, identifiers: ReadonlyMap<string, string | undefined>) {
  const { summary } = report;
  return {
    ...(report.model ? { model: report.model } : {}),
    specs_total: summary.totalSpecifications,
    specs_passed: summary.passedSpecifications,
    specs_failed: summary.failedSpecifications,
    elements_checked: summary.totalEntitiesChecked,
    elements_passed: summary.totalEntitiesPassed,
    elements_failed: summary.totalEntitiesFailed,
    specs: report.specs.slice(0, MAX_LOCAL_SPECS).map((r) => ({
      id: r.id,
      ...(identifiers.get(r.id) ? { identifier: identifiers.get(r.id) } : {}),
      name: r.name,
      status: r.status,
      applicable: r.applicableCount,
      passed: r.passedCount,
      failed: r.failedCount,
    })),
  };
}

/**
 * `dirty` platí len pre IDS z AIM (má kód): rozdiel proti XML z načítania alebo posledného uloženia. IDS, ktoré
 * v AIM ešte nie je, je vždy neuložené (`from_aim: false`, `dirty: true`).
 */
export function buildIdsLocal(input: IdsLocalInput, withXml: boolean): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const { studio, validation, slots } = input;
  if (studio) {
    const slot = slots.studio;
    const linked = !!slot?.code && slot.docId === studio.docId;
    out.studio = {
      title: studio.title,
      specs: studio.specs,
      ...link(slot, linked),
      from_aim: linked,
      dirty: linked ? studio.xml !== slot?.baseline : true,
      ...xmlPart(studio.xml, withXml),
    };
  }
  if (validation) {
    const slot = slots.validation;
    const linked = !!slot?.code && validation.entryId !== null && slot.entryId === validation.entryId;
    out.validation = {
      title: validation.title,
      specs: validation.specs,
      ...link(slot, linked),
      from_aim: linked,
      dirty: linked ? validation.xml !== slot?.baseline : true,
      ...xmlPart(validation.xml, withXml),
      ...(validation.report ? { results: resultsOf(validation.report, validation.identifiers) } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `ids_local` bez XML dokumentov (potvrdenie príkazu `APPLIED` ich nenesie). */
export function briefIdsLocal(local: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...local };
  for (const key of ['studio', 'validation'] as const) {
    const part = local[key];
    if (part && typeof part === 'object' && 'xml' in part) {
      const { xml: _xml, ...rest } = part as Record<string, unknown>;
      void _xml;
      out[key] = rest;
    }
  }
  return out;
}
