/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lens z chatu vo vieweri (AIM D-096): `APPLY_LENS` vloží AIM chat lens do
 * dočasného slotu `AUTO_COLOR_FROM_LIST_ID` (ten istý ako "Color by" z tabuľky:
 * upstream ho neukladá do localStorage ani neexportuje), aktivuje ju a otvorí
 * panel Lens; vyhodnotenie, farby, skrytie a počty robí upstream `useLens`.
 * Izolácia (`isolate: true`) ide mimo lens: pravidlá sa vyhodnotia tým istým
 * federovaným filtrom ako lens a ich zjednotenie sa izoluje kanálom izolácie
 * viewera, takže prvky bez farby ostanú v pôvodnom vzhľade. X-ray (`xray: true`,
 * AIM D-105) dá to isté zjednotenie do kanála ghost (ako tlačidlo "duch" v paneli
 * prvku): vybrané ostanú plné, zvyšok modelu priesvitný.
 * `LENS_QUERY` počká na vyhodnotenie verzie `rev` a vráti počty hosťovi.
 * D-119 (`aimLensScope.ts`): farby podľa hodnoty len pre prvky filtra (alebo viditeľné),
 * zapnutie skrytých miestností a zón, ktoré lens zasiahla, a veľká legenda.
 * Načítava sa lenivo z `AimBridge` pri prvej správe Lens.
 */

import type { Lens } from '@ifc-lite/lens';
import { useViewerStore } from '@/store';
import { AUTO_COLOR_FROM_LIST_ID } from '@/lib/lens/persistence';
import { evaluateLensGroups } from '@/lib/lens/evaluate-lens-groups';
import { definedModelTagIdsOf, evaluatorModelsFromState } from '@/lib/model-tags/evaluator-models';
import { resolvePresentationIds } from '@/lib/presentation/resolvePresentationIds';
import { ruleIsolationOwnsChannel } from '@/components/viewer/lens-visibility-ownership';
import type { LensInboundMessage } from './lens-protocol.js';
import type { ViewQueryResult } from './view-protocol.js';
import {
  isAimLens, isEvaluated, isolationRules, nextAimLens, parseLensMessage, summarizeLens,
  type AimIsolation, type ApplyLensMessage, type LensQueryMessage,
} from './aimLensPlan.js';
import { noteIssue } from './command-gate.js';
import { applyLegendSize, autoColorScope, revealAfterLens, revealGatesFor } from './aimLensScope.js';

const SLOT = AUTO_COLOR_FROM_LIST_ID;
const POLL_MS = 100;
const WAIT_MS = 6000;

/** Posledná použitá verzia od hosta (na párovanie `LENS_QUERY`). */
let appliedRev: string | undefined;
/** Verzia, ktorej izolácia ešte beží (vyhodnotenie je asynchrónne). */
let pendingIsolationRev: string | null = null;
/** Izolácia alebo X-ray z chatu: počty a presné id v kanáli (uvoľní sa len, ak ich kanál stále drží). */
let isolation: (AimIsolation & { ids: number[]; raw: number[] }) | null = null;
/** Poradie izolácií: staršia, ktorá dobehne po novšej alebo po zrušení, sa zahodí. */
let isolationGen = 0;
/** Verzia, ktorej izolácia zlyhala (`LENS_QUERY` ju nahlási ako chybu, nie úspech). */
let isolationFailedRev: string | null = null;
/** Posledná odmietnutá (neplatná) `APPLY_LENS`: `LENS_QUERY` ju nahlási ako chybu. Bez rev = `*`. */
let rejectedRev: string | null = null;
/** Chat poslal `APPLY_LENS` (aj bez `rev`): `APPLIED` nesie súhrn lens (D-101). */
let lensUsed = false;
let seq = 0;
/** Poradie farieb podľa hodnoty: rozsah sa počíta asynchrónne, staršia správa po novšej sa zahodí (D-119). */
let scopeGen = 0;
/** Verzia, ktorej rozsah sa ešte počíta (drží ju aj `pendingIsolationRev`, aby `LENS_QUERY` počkal). */
let scopingRev: string | null = null;

type State = ReturnType<typeof useViewerStore.getState>;
const slotLens = (s: State) => s.savedLenses.find((l) => l.id === SLOT) ?? null;

/** Drží kanál (izolácia alebo ghost) stále presne to, čo doň dal chat? */
function ownsChannel(s: State, iso: { ids: number[]; xray?: true }): boolean {
  return ruleIsolationOwnsChannel(iso.xray ? s.ghostExceptEntities : s.isolatedEntities, iso.ids);
}

/** Zruší izoláciu alebo X-ray z chatu, ak ich kanál stále drží (inak patrí niekomu inému). */
function clearOwnedChannel(): void {
  const state = useViewerStore.getState();
  if (!isolation || !ownsChannel(state, isolation)) return;
  if (isolation.xray) state.clearGhost();
  else state.clearIsolation();
}

function releaseIsolation(): void {
  isolationGen++;
  pendingIsolationRev = null;
  isolationFailedRev = null;
  clearOwnedChannel();
  isolation = null;
}

async function isolate(msg: ApplyLensMessage, rules: Lens['rules'], tag: string, gen: number): Promise<void> {
  const state = useViewerStore.getState();
  const probe: Lens = { id: `aim-isolate-${tag}`, name: 'AIM isolate', rules };
  const matched = await evaluateLensGroups(probe, evaluatorModelsFromState(state), state.models, definedModelTagIdsOf(state));
  if (gen !== isolationGen) return;
  const raw = new Set<number>();
  for (const ids of matched.values()) for (const id of ids) raw.add(id);
  // Izolované miestnosti (zóny) sú predvolene vypnutá trieda: bez zapnutia by izolácia ukázala prázdnu scénu (D-119).
  revealGatesFor(raw);
  const xray = msg.xray === true;
  // `add` k izolácii (X-ray) z chatu rozšíri doterajšiu, nie nahradí (AIM D-101, #95) - ak ju kanál stále
  // drží a je to ten istý kanál. Kanál podľa stavu po vyhodnotení: príkaz hosta počas `await` ho prevezme.
  const owns = isolation && ownsChannel(useViewerStore.getState(), isolation);
  const prev = msg.mode === 'add' && owns && !!isolation?.xray === xray ? isolation : null;
  if (prev) for (const id of prev.raw) raw.add(id);
  // Druhý kanál z chatu (izolácia po X-ray a naopak) uvoľniť, inak by ostal visieť.
  if (owns && !!isolation?.xray !== xray) clearOwnedChannel();
  // Zostava bez geometrie (schodisko ako kontajner) sa izoluje cez svoje časti, ako v paneli Lens.
  const ids = resolvePresentationIds(useViewerStore.getState().cameraCallbacks.resolveHighlightIds, [...raw]);
  const now = useViewerStore.getState();
  if (xray) {
    // Ghost ruší izoláciu (vzájomne výlučné kanály viewera); prázdna množina by stlmila celý model.
    if (ids.length > 0) now.setGhostExceptEntities(new Set(ids));
    else if (owns && isolation?.xray) now.clearGhost();
  } else {
    // `isolateEntities` je prepínač: rovnaká množina v kanáli by izoláciu zrušila.
    if (ruleIsolationOwnsChannel(now.isolatedEntities, ids)) now.clearIsolation();
    if (ids.length > 0) now.isolateEntities(ids);
  }
  isolation = {
    ...(msg.rev ? { rev: msg.rev } : {}),
    rules: [...(prev?.rules ?? []), ...rules.map((r) => ({ name: r.name, count: matched.get(r.id)?.size ?? 0 }))],
    isolated: raw.size,
    ...(xray ? { xray: true as const } : {}),
    ids,
    raw: [...raw],
  };
}

function applyLens(msg: ApplyLensMessage, scope?: Lens['capturedScope']): void {
  rejectedRev = null;
  lensUsed = true;
  const state = useViewerStore.getState();
  const prev = slotLens(state);
  const models = [...state.models.values()].map((m) => ({ name: m.name, fingerprint: m.sourceFingerprint }));
  const tag = msg.rev ?? `s${++seq}`;
  const built = nextAimLens(prev, msg, SLOT, models, tag);
  // Farby podľa hodnoty len pre zachytené prvky (filter volania alebo viditeľné, D-119).
  const next = built?.autoColor && scope ? { ...built, capturedScope: scope } : built;
  if (msg.legend) applyLegendSize(msg.legend);
  appliedRev = msg.rev;
  if (msg.mode === 'clear' || msg.mode === 'unisolate') releaseIsolation();
  const toIsolate = isolationRules(msg, models, tag);
  if (toIsolate.length > 0) {
    const rev = msg.rev ?? tag;
    pendingIsolationRev = rev;
    isolationFailedRev = null;
    const gen = ++isolationGen;
    void isolate(msg, toIsolate, tag, gen)
      .catch((err: unknown) => {
        if (gen !== isolationGen) return;
        isolationFailedRev = rev;
        noteIssue(`Lens: izolácia z chatu zlyhala (${err instanceof Error ? err.message : String(err)})`);
      })
      .finally(() => {
        // Len posledná izolácia: staršia s tou istou verziou nesmie skončiť čakanie novšej.
        if (gen === isolationGen) pendingIsolationRev = null;
      });
  }
  if (next === prev) return;
  const others = state.savedLenses.filter((l) => l.id !== SLOT);
  if (!next) {
    // "Color by" z tabuľky v tom istom slote chat nevypína.
    if (!isAimLens(prev)) return;
    useViewerStore.setState({ savedLenses: others, activeLensId: state.activeLensId === SLOT ? null : state.activeLensId });
    return;
  }
  useViewerStore.setState({ savedLenses: [...others, next], activeLensId: SLOT, lensPanelVisible: true });
  revealAfterLens(next.rules.map((r) => r.id));
}

/** Farby podľa hodnoty: najprv rozsah (asynchrónne vyhodnotenie filtra), potom lens (D-119). */
async function applyAutoColor(msg: ApplyLensMessage): Promise<void> {
  const gen = ++scopeGen;
  const rev = msg.rev ?? '*';
  lensUsed = true;
  scopingRev = rev;
  pendingIsolationRev = rev;
  let result: Awaited<ReturnType<typeof autoColorScope>>;
  try {
    result = await autoColorScope(msg.autoColorScope as Parameters<typeof autoColorScope>[0]);
  } catch (err) {
    result = { issue: `Lens: rozsah farieb podľa hodnoty zlyhal (${err instanceof Error ? err.message : String(err)})` };
  }
  if (gen !== scopeGen) return;
  endScoping();
  if (result.issue) noteIssue(result.issue);
  applyLens(msg, result.scope);
}

/** Ukončí čakanie na rozsah; čakanie izolácie z inej správy nechá tak. */
function endScoping(): void {
  if (scopingRev !== null && pendingIsolationRev === scopingRev) pendingIsolationRev = null;
  scopingRev = null;
}

/** Izolácia (X-ray) z chatu pre hosta, bez interných id. */
function isolationSummary(): AimIsolation | null {
  if (!isolation) return null;
  const { rev, rules, isolated, xray } = isolation;
  return { rev, rules, isolated, ...(xray ? { xray } : {}) };
}

function answerLensQuery(msg: LensQueryMessage, origin: string, started = Date.now()): void {
  const reply = (r: ViewQueryResult) => window.parent.postMessage(r, origin);
  if (rejectedRev !== null && (!msg.rev || rejectedRev === '*' || rejectedRev === msg.rev)) {
    reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: false, error: 'Viewer správu lens odmietol (neplatné pravidlá).' });
    return;
  }
  const state = useViewerStore.getState();
  const lens = state.activeLensId === SLOT && isAimLens(slotLens(state)) ? slotLens(state) : null;
  const revReady = !msg.rev || appliedRev === msg.rev;
  const ready = revReady && pendingIsolationRev === null
    && (!lens || isEvaluated(lens, state.lensRuleCounts, state.lensAutoColorLegend));
  if (!ready && Date.now() - started < WAIT_MS) {
    setTimeout(() => answerLensQuery(msg, origin, started), POLL_MS);
    return;
  }
  if (!revReady) {
    reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: false, error: 'Lens s touto verziou do viewera neprišla.' });
    return;
  }
  // Bez rev sa pýta na poslednú izoláciu; zlyhaná izolácia nesmie odpovedať úspechom.
  if (isolationFailedRev !== null && (!msg.rev || isolationFailedRev === msg.rev)) {
    reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: false, error: 'Izolácia tejto verzie vo vieweri zlyhala.' });
    return;
  }
  const iso = isolationSummary();
  const summary = summarizeLens(lens, state.lensRuleCounts, state.lensAutoColorLegend, msg.rev, iso);
  reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: true, result: { ...summary, ...(ready ? {} : { pending: true }) } });
}

/** Súhrn poslednej lens z chatu po jej vyhodnotení (D-101, `APPLIED`); null = chat lens nepoužil. */
export async function settledLensSummary(timeoutMs: number, started = Date.now()): Promise<unknown> {
  if (!lensUsed && !isolation && pendingIsolationRev === null) return null;
  const state = useViewerStore.getState();
  const lens = state.activeLensId === SLOT && isAimLens(slotLens(state)) ? slotLens(state) : null;
  const ready = pendingIsolationRev === null && (!lens || isEvaluated(lens, state.lensRuleCounts, state.lensAutoColorLegend));
  if (!ready && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    return settledLensSummary(timeoutMs, started);
  }
  const iso = isolationSummary();
  return { ...summarizeLens(lens, state.lensRuleCounts, state.lensAutoColorLegend, appliedRev, iso), ...(ready ? {} : { pending: true }) };
}

export function handleLensMessage(data: LensInboundMessage, origin: string): void {
  const msg = parseLensMessage(data);
  if (!msg) {
    console.warn('[aim-bridge] neplatná správa Lens', data.type);
    if (data.type === 'APPLY_LENS') {
      rejectedRev = typeof data.rev === 'string' && data.rev ? data.rev : '*';
      noteIssue('Lens: viewer správu odmietol (neplatné pravidlá)'); // aj do najbližšieho APPLIED (D-101)
    }
    if (data.type === 'LENS_QUERY' && typeof data.id === 'string') {
      window.parent.postMessage({ source: data.source, type: 'QUERY_RESULT', id: data.id, ok: false, error: 'neplatná otázka' }, origin);
    }
    return;
  }
  if (msg.type === 'LENS_QUERY') {
    answerLensQuery(msg, origin);
    return;
  }
  if (msg.autoColor) {
    void applyAutoColor(msg);
    return;
  }
  // Novšia správa zruší rozsah, ktorý sa ešte počíta.
  scopeGen++;
  endScoping();
  applyLens(msg);
}

/** Odpojenie mostu (AimBridge): zruší izoláciu z chatu, vypne AIM chat lens a zabudne verzie. */
export function resetAimLens(): void {
  releaseIsolation();
  const state = useViewerStore.getState();
  const lens = slotLens(state);
  if (isAimLens(lens)) {
    const wasActive = state.activeLensId === SLOT;
    useViewerStore.setState({
      savedLenses: state.savedLenses.filter((l) => l.id !== SLOT),
      activeLensId: wasActive ? null : state.activeLensId,
      // Panel otvorila lens z chatu; so zrušenou lens ho zavrieť.
      ...(wasActive ? { lensPanelVisible: false } : {}),
    });
  }
  appliedRev = undefined;
  scopeGen++;
  scopingRev = null;
  lensUsed = false;
  rejectedRev = null;
  pendingIsolationRev = null;
  isolationFailedRev = null;
}

