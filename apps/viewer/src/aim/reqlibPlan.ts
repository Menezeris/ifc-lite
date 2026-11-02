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
