/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav IDS z AIM (D-162): ku ktorému dokumentu v AIM (kód a verzia) patrí IDS otvorené v Studiu a v paneli
 * validácie, výsledok posledného uloženia, čakajúci beh z chatu a opis pre `view_state.ids_local`.
 * Lenivý modul (číta ho `aimIds.ts`, tlačidlo a `viewQueries.ts`); vstupný balík ho nevidí.
 */

import { create } from 'zustand';
import { useViewerStore } from '../store/index.js';
import type { IdsTarget } from './ids-protocol.js';
import { buildIdsLocal, type IdsSlot, type LocalReport } from './aimIdsLocal.js';

export type { IdsSlot };

export interface IdsStatus {
  target: IdsTarget;
  kind: 'saving' | 'saved' | 'conflict' | 'error';
  code?: string;
  version?: number;
  latest?: number;
  error?: string;
}

export interface AimIdsState {
  studio: IdsSlot | null;
  validation: IdsSlot | null;
  /** Aktuálne XML dokumentu v Studiu (drží `aimIds.ts` po každej zmene). */
  studioXml: string | null;
  status: IdsStatus | null;
  /** Beh z chatu čaká na panel validácie, kým sa nenačíta dokument a model. */
  run: { spec?: string; seq: number } | null;
}

export const useAimIds = create<AimIdsState>()(() => ({ studio: null, validation: null, studioXml: null, status: null, run: null }));

type Viewer = ReturnType<typeof useViewerStore.getState>;

/** Aktívna položka knižnice definícií pre IDS (XML tam, kam ho viewer načítal). */
export function activeIdsEntry(v: Viewer): { id: string; xml: string } | null {
  const id = v.validationDefinitions.active.ids;
  const entry = id ? v.validationDefinitions.entries.find((e) => e.id === id) : undefined;
  return entry?.kind === 'ids' ? { id: entry.id, xml: entry.xml } : null;
}

/** Posledný beh z panela validácie (len IDS, nie pravidlá) v tvare pre `ids_local`. */
function reportOf(v: Viewer): LocalReport | null {
  const report = v.idsValidationReport;
  if (!report || report.source.kind !== 'ids') return null;
  return {
    ...(report.modelInfo[0]?.modelId ? { model: report.modelInfo[0].modelId } : {}),
    summary: report.summary,
    specs: report.specificationResults.map((r) => ({
      id: r.specification.id, name: r.specification.name, status: r.status,
      applicableCount: r.applicableCount, passedCount: r.passedCount, failedCount: r.failedCount,
    })),
  };
}

/** `view_state.ids_local` (D-162) zo store; `withXml` pridá XML dokumentov pre `ids_document from_viewer`. */
export function describeIdsLocal(withXml: boolean): Record<string, unknown> | undefined {
  const aim = useAimIds.getState();
  const v = useViewerStore.getState();
  const studio = v.idsStudioState?.doc;
  const doc = v.idsDocument;
  const entry = activeIdsEntry(v);
  return buildIdsLocal({
    slots: { studio: aim.studio, validation: aim.validation },
    studio: studio ? { docId: studio.docId, title: studio.ids.info.title, specs: studio.ids.specifications.length, xml: aim.studioXml } : null,
    validation: doc ? {
      title: doc.info.title, specs: doc.specifications.length, entryId: entry?.id ?? null, xml: entry?.xml ?? null,
      identifiers: new Map(doc.specifications.map((s) => [s.id, s.identifier])), report: reportOf(v),
    } : null,
  }, withXml);
}
