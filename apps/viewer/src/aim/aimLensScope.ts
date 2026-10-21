/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Doplnky Lens z chatu (AIM D-119), načítané spolu s `aimLens.ts`:
 * - **rozsah "Color by"** (#135): farby podľa hodnoty len pre prvky z filtra
 *   volania, inak pre viditeľné prvky pri aktívnej izolácii či skrytí. Upstream
 *   na to má `Lens.capturedScope` (v UI "Population"); legenda aj počty sú
 *   potom len za tieto prvky;
 * - **zapnutie skrytých tried** (#136): miestnosti (IfcSpace) a zóny sú vo
 *   vieweri predvolene vypnuté, takže ich farbenie alebo izolácia z chatu
 *   nebola vidieť. Rovnaký prepínač ako pri FOCUS (`frame-gates.ts`, D-102);
 * - **veľká legenda** (#135): panel Lens ako veľké plávajúce okno (upstream
 *   `floatPanel`), legenda v ňom nie je orezaná (pravidlo v `assetin-theme.css`);
 *   **malá** (`compact`, D-125): karta `AimLensLegendCard` bez panelu Lens.
 */

import type { Lens } from '@ifc-lite/lens';
import { MAX_CAPTURED_SCOPE_MEMBERS, resolveCapturedEntityScope, type CapturedEntityScope, type FilterGroup } from '@ifc-lite/rules';
import { useViewerStore } from '@/store';
import { fromGlobalIdFromModels } from '@/store/globalId';
import { captureArtifactScope } from '@/lib/captured-artifact-scope';
import { evaluateLensGroups } from '@/lib/lens/evaluate-lens-groups';
import { definedModelTagIdsOf, evaluatorModelsFromState } from '@/lib/model-tags/evaluator-models';
import type { EntityRef } from '@ifc-lite/sdk';
import { revealGatesForRefs } from './frame-refs.js';
import { legendPanelRect, type LegendSize } from './aimLensPlan.js';
import { useAimLegendStore } from './aimLegendStore.js';

type State = ReturnType<typeof useViewerStore.getState>;

const POLL_MS = 100;
const WAIT_MS = 6000;

/** Zapne skryté triedy (miestnosti, zóny), ak medzi prvkami nejaké sú. */
export function revealGatesFor(globalIds: Iterable<number>): void {
  const models = useViewerStore.getState().models;
  const refs: EntityRef[] = [];
  for (const id of globalIds) {
    const ref = fromGlobalIdFromModels(models, id);
    if (ref) refs.push(ref);
  }
  revealGatesForRefs(refs);
}

/**
 * Po vyhodnotení pravidiel lens (useLens zapíše `lensRuleEntityIds`) zapne
 * triedy ich prvkov. Lens nahradená skôr, než sa vyhodnotila, nezapne nič;
 * `onTimeout` volajúci použije na hlásenie, ak lens ešte platí.
 */
export function revealAfterLens(ruleIds: readonly string[], onTimeout?: () => void, started = Date.now()): void {
  if (ruleIds.length === 0) return;
  const done = useViewerStore.getState().lensRuleEntityIds;
  if (!ruleIds.every((id) => done.has(id))) {
    if (Date.now() - started < WAIT_MS) setTimeout(() => revealAfterLens(ruleIds, onTimeout, started), POLL_MS);
    else onTimeout?.();
    return;
  }
  revealGatesFor(ruleIds.flatMap((id) => done.get(id) ?? []));
}

/** Zachytená množina z globalId (vzor `captureArtifactScope`); prvky bez identity súboru vynechá. */
function scopeFromIds(state: State, ids: ReadonlySet<number>): CapturedEntityScope | null {
  const sources = new Map<string, CapturedEntityScope['sources'][number]>();
  for (const id of ids) {
    const ref = fromGlobalIdFromModels(state.models, id);
    const model = ref ? state.models.get(ref.modelId) : undefined;
    if (!ref || !model?.sourceFingerprint || !model.sourceContentHash) continue;
    // Prvok vytvorený vo vieweri nemá v súbore stabilnú identitu; farby podľa hodnoty ho vynechajú.
    if (state.mutationViews.get(ref.modelId)?.getNewEntity(ref.expressId)) continue;
    let source = sources.get(ref.modelId);
    if (!source) {
      source = { sourceFingerprint: model.sourceFingerprint, sourceContentHash: model.sourceContentHash, members: [] };
      sources.set(ref.modelId, source);
    }
    source.members.push({ expressId: ref.expressId });
  }
  if (sources.size === 0) return null;
  const scope: CapturedEntityScope = { version: 1, mode: 'selected', capturedAt: Date.now(), sources: [...sources.values()] };
  resolveCapturedEntityScope(scope, evaluatorModelsFromState(state));
  return scope;
}

/** Je niečo skryté, izolované alebo len časť podlaží? Potom "viditeľné" nie je celý model. */
function viewIsNarrowed(state: State): boolean {
  return (state.isolatedEntities?.size ?? 0) > 0 || state.hiddenEntities.size > 0 || state.selectedStoreys.size > 0
    || (state.ghostExceptEntities?.size ?? 0) > 0;
}

/**
 * Rozsah "Color by" z chatu: prvky filtra (`groups`), bez filtra viditeľné
 * prvky, ak je pohľad zúžený; `undefined` = celý model. Problém (nič sa
 * nenašlo, priveľa prvkov) vráti v `issue`, farby potom idú na celý model.
 */
export async function autoColorScope(
  groups: FilterGroup[] | undefined,
): Promise<{ scope?: CapturedEntityScope; issue?: string }> {
  const state = useViewerStore.getState();
  if (!groups?.length) {
    const ghost = state.ghostExceptEntities;
    if (!viewIsNarrowed(state)) return {};
    // X-ray: plné prvky sú tie v kanáli ghost; capture "visible" by vzal aj priesvitné.
    if (ghost && ghost.size > 0) return limited(state, ghost);
    try {
      return { scope: captureArtifactScope('visible', state) };
    } catch (err) {
      return { issue: `Lens: farby podľa hodnoty idú na celý model (${err instanceof Error ? err.message : String(err)})` };
    }
  }
  const probe: Lens = { id: 'aim-scope', name: 'AIM scope', rules: [{ id: 'scope', name: 'scope', enabled: true, action: 'colorize', color: '#000000', groups }] };
  const matched = await evaluateLensGroups(probe, evaluatorModelsFromState(state), state.models, definedModelTagIdsOf(state));
  const ids = matched.get('scope') ?? new Set<number>();
  if (ids.size === 0) return { issue: 'Lens: filter farieb podľa hodnoty nenašiel vo vieweri žiadny prvok' };
  revealGatesFor(ids);
  return limited(useViewerStore.getState(), ids);
}

function limited(state: State, ids: ReadonlySet<number>): { scope?: CapturedEntityScope; issue?: string } {
  if (ids.size > MAX_CAPTURED_SCOPE_MEMBERS) {
    return { issue: `Lens: priveľa prvkov na farby podľa hodnoty (${ids.size}, strop ${MAX_CAPTURED_SCOPE_MEMBERS}), farby idú na celý model` };
  }
  const scope = scopeFromIds(state, ids);
  return scope ? { scope } : { issue: 'Lens: prvky filtra nemajú identitu súboru, farby idú na celý model' };
}

/** Veľká legenda: panel Lens ako plávajúce okno cez takmer celý viewer; `normal` ho vráti do lišty. */
export function applyLegendSize(size: LegendSize): void {
  const state = useViewerStore.getState();
  // Strop výšky legendy v LensPanel ruší pravidlo v `assetin-theme.css` (upstream súbor ostáva bez zmeny).
  if (size === 'large') document.documentElement.dataset.aimBigLegend = '1';
  else delete document.documentElement.dataset.aimBigLegend;
  useAimLegendStore.getState().setVisible(size === 'compact');
  if (size === 'compact') {
    // Malá karta (D-125) namiesto panelu Lens s predvolenými lenses.
    if (state.floatingPanels.some((p) => p.id === 'lens')) state.closeFloatingPanel('lens');
    useViewerStore.setState({ lensPanelVisible: false });
    return;
  }
  if (size === 'normal') {
    if (state.floatingPanels.some((p) => p.id === 'lens')) state.closeFloatingPanel('lens');
    useViewerStore.setState({ lensPanelVisible: true });
    return;
  }
  useViewerStore.setState({ lensPanelVisible: true });
  state.floatPanel('lens');
  state.setFloatingPanelRect('lens', legendPanelRect(window.innerWidth, window.innerHeight));
  scrollToLegend();
}

/** Legenda je pod kartami predvolených lens: posunúť panel na ňu, keď ju useLens vykreslí. */
function scrollToLegend(started = Date.now()): void {
  const legend = document.querySelector('[data-tour="lens-legend"]');
  if (legend) {
    legend.scrollIntoView({ block: 'start' });
    return;
  }
  if (Date.now() - started < WAIT_MS) setTimeout(() => scrollToLegend(started), POLL_MS * 2);
}
