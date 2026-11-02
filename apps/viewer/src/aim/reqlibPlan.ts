/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čistá logika knižnice požiadaviek (AIM D-182): výsledok panela validácie po modeloch pre `save_run`,
 * verzia nástroja a čitateľné stavy karty. Bez store a bez DOM, testuje ju `reqlibPlan.test.ts`.
 */

/** Podmnožina reportu `@ifc-lite/ids` (`idsValidationReport.specificationResults`), ktorú host ukladá. */
export interface ReportSpecLike {
  specification: { id?: string; identifier?: string; name?: string; description?: string; instructions?: string };
  status: string;
  applicableCount?: number;
  entityResults: Array<{
    modelId?: string;
    globalId?: string;
    entityType?: string;
    passed: boolean;
    requirementResults?: Array<{ status?: string; failureReason?: string }>;
  }>;
}

export interface WireSpec {
  specification: { id?: string; identifier?: string; name?: string; description?: string; instructions?: string };
  status: string;
  applicableCount: number;
  entityResults: Array<{ globalId?: string; entityType?: string; passed: boolean; requirementResults: Array<{ status?: string; failureReason?: string }> }>;
}

export interface WireRun {
  model_id: string;
  model_name: string;
  specs: WireSpec[];
}

/**
 * Výsledok po modeloch federácie: host ukladá beh k jednej revízii jedného modelu. Stav špecifikácie sa pre model
 * prepočíta z jeho prvkov; bez prvkov ostáva stav celého behu (povinná špecifikácia bez prvku = nesplnená).
 * Dôvody len pri nesplnených požiadavkách (ako `etl.ids_check` a `ifc_ids_validate save`).
 */
export function runsByModel(specs: readonly ReportSpecLike[], modelIds: readonly string[], nameOf: (id: string) => string): WireRun[] {
  // Prvok bez modelu sa dá priradiť len vtedy, keď beh má jediný model; inak by sa pripísal zlému modelu.
  if (modelIds.length !== 1 && specs.some((s) => s.entityResults.some((e) => !e.modelId))) {
    throw new Error('Výsledok obsahuje prvok bez modelu a beh má viac modelov; neuložil sa (spusti kontrolu na jednom modeli).');
  }
  return modelIds.map((modelId) => ({
    model_id: modelId,
    model_name: nameOf(modelId),
    specs: specs.map((s) => {
      const entities = s.entityResults.filter((e) => (e.modelId ?? modelIds[0]) === modelId);
      const status = entities.length === 0 ? s.status : entities.some((e) => !e.passed) ? 'fail' : 'pass';
      return {
        specification: { ...s.specification },
        status,
        applicableCount: entities.length,
        entityResults: entities.map((e) => ({
          ...(e.globalId ? { globalId: e.globalId } : {}),
          ...(e.entityType ? { entityType: e.entityType } : {}),
          passed: e.passed,
          requirementResults: (e.requirementResults ?? [])
            .filter((r) => r.status === 'fail')
            .map((r) => ({ status: 'fail', ...(r.failureReason ? { failureReason: r.failureReason } : {}) })),
        })),
      };
    }),
  }));
}

/** Odpoveď hosta na `assign`: známy stav, inak chyba (prázdna odpoveď sa nesmie tváriť ako úspech). */
export function assignOutcome(out: Record<string, unknown> | null | undefined):
  | { kind: 'choice'; code: string; candidates: string[]; message: string }
  | { kind: 'ok' | 'error'; text: string } {
  const code = typeof out?.code === 'string' ? out.code : null;
  const version = typeof out?.version === 'number' ? out.version : null;
  switch (out?.status) {
    case 'choice_required':
      if (!code) break;
      return { kind: 'choice', code, candidates: Array.isArray(out.candidates) ? out.candidates.filter((c): c is string => typeof c === 'string') : [], message: String(out.message ?? '') };
    case 'unchanged':
      if (!code || version === null) break;
      return { kind: 'ok', text: `Bez zmeny: ${code} v${version} už má tento obsah.` };
    case 'created':
      if (!code || version === null) break;
      return { kind: 'ok', text: `Priradené k projektu ako ${code} v${version}.` };
    case 'new_version':
      if (!code || version === null) break;
      return { kind: 'ok', text: `Nová verzia ${code} v${version}${typeof out.renamed_from === 'string' ? ` (predtým ${out.renamed_from})` : ''}.` };
  }
  return { kind: 'error', text: 'AIM nevrátil výsledok priradenia; obnov knižnicu a skontroluj, či sa IDS priradilo.' };
}

/** Odpoveď hosta na `save_run`: úspech len so zoznamom uložených modelov. */
export function saveRunOutcome(out: unknown): { ok: boolean; text: string } {
  const saved = (out as { saved?: unknown } | null | undefined)?.saved;
  const rows = Array.isArray(saved)
    ? saved.filter((s): s is { model: string; revision: number; warning?: string } =>
      !!s && typeof s === 'object' && typeof (s as { model?: unknown }).model === 'string' && typeof (s as { revision?: unknown }).revision === 'number')
    : [];
  if (rows.length === 0 || rows.length !== (saved as unknown[]).length) return { ok: false, text: 'AIM nevrátil uložené modely; výsledok sa neuložil.' };
  const warn = rows.map((s) => s.warning).filter(Boolean).join(' ');
  return { ok: true, text: `Výsledok uložený do AIM (${rows.map((s) => `${s.model} v${s.revision}`).join(', ')}).${warn ? ` ${warn}` : ''}` };
}

/** Verzia nástroja do pečiatky výsledku: `@ifc-lite/ids` z balíkov forku. */
export function idsEngineVersion(pkgs: ReadonlyArray<{ name: string; version: string }>): string {
  const ids = pkgs.find((p) => p.name === '@ifc-lite/ids');
  return ids ? `@ifc-lite/ids ${ids.version}` : '@ifc-lite/ids';
}

/** sha256 textu (UTF-8) ako hex, rovnako ako host (`createHash('sha256').update(xml)`). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type LibraryState = 'not_assigned' | 'assigned' | 'differs' | 'collision' | 'invalid';

/** Text stavu súboru knižnice voči projektu. */
export function libraryStateText(state: LibraryState, aim?: { code: string; version: number | null }): string {
  switch (state) {
    case 'not_assigned': return 'Nie je v projekte';
    case 'assigned': return `V projekte ako ${aim?.code} v${aim?.version ?? '?'}`;
    case 'differs': return `V knižnici je iná verzia než v projekte (${aim?.code} v${aim?.version ?? '?'})`;
    case 'collision': return `Kód už má pracovné IDS ${aim?.code}; priradiť nejde`;
    case 'invalid': return 'Súbor sa nedá priradiť';
  }
}

/** Výsledok uloženého behu na modeli: platný, alebo prečo je zastaraný. */
export function runStateText(run: { stale: boolean | null; ids_stale: boolean }): string {
  const why = [run.stale ? 'novšia revízia modelu' : null, run.ids_stale ? 'novšia verzia IDS' : null].filter(Boolean);
  if (why.length) return `zastaraný (${why.join(', ')})`;
  return run.stale === null ? 'revízia neznáma' : 'aktuálny';
}

export const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : '');
