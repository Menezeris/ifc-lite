/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Spustenie zoznamu z chatu (AIM D-148): `OPEN_LIST` s `run: true` si zapíše
 * požiadavku, hook `useAimListAutoRun` v `ListPanel` ju po zobrazení panela
 * vykoná existujúcim `handleExecuteList` a `APPLIED` z nej zloží súhrn
 * (`settledListSummary`). Nič z upstream sa nekopíruje.
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { ListDefinition } from '@/lib/lists';
import { listRunDefinition } from '@/lib/lists/run-provenance';
import { useViewerStore } from '@/store';
import { summarizeListRun, type ListRunRequest, type ListRunSnapshot, type ListRunSummary } from './aimListRunPlan.js';

const POLL_MS = 50;

let request: ListRunRequest | null = null;
let pending: ListDefinition | null = null;
/** Posledná definícia z chatu, aj nespustená (builder); `LIST_UPDATE` z nej vychádza (D-149). */
let lastDefinition: ListDefinition | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** `OPEN_LIST` otvoril zoznam; s `run` ho hook po zobrazení panela spustí. */
export function noteListOpened(definition: ListDefinition, run: boolean): void {
  request = { id: definition.id, name: definition.name, run, started: false };
  pending = run ? definition : null;
  lastDefinition = definition;
  emit();
}

/** `LIST_UPDATE` bez nového behu (D-149): zobrazený výsledok je výsledok tejto definície. */
export function noteListUpdated(definition: ListDefinition): void {
  request = { id: definition.id, name: definition.name, run: true, started: true };
  pending = null;
  lastDefinition = definition;
  emit();
}

export const chatListDefinition = () => lastDefinition;

function snapshot(): ListRunSnapshot {
  const s = useViewerStore.getState();
  const def = s.listResult ? listRunDefinition(s.listResult) : null;
  return {
    executing: s.listExecuting,
    error: s.listError,
    result: s.listResult ? { id: def?.id ?? null, totalCount: s.listResult.totalCount } : null,
  };
}

/** Súhrn pre `APPLIED`: null = zoznam z chatu sa nepoužil; počká na dobehnutie behu najviac `timeoutMs`. */
export async function settledListSummary(timeoutMs: number): Promise<ListRunSummary | null> {
  const started = Date.now();
  for (;;) {
    if (!request) return null;
    const timedOut = Date.now() - started >= timeoutMs;
    const summary = summarizeListRun(request, snapshot(), timedOut);
    if (summary) return summary;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export function resetListRun(): void {
  request = null;
  pending = null;
  lastDefinition = null;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const hasPending = () => pending !== null;

/**
 * Volá sa v `ListPanel` s jeho `handleExecuteList`: keď čaká zoznam z chatu s `run`
 * a panel má dáta, tabuľku spustí raz. Bez dát čaká (modely sa ešte stavajú).
 */
export function useAimListAutoRun(execute: (definition: ListDefinition) => void, hasData: boolean): void {
  const waiting = useSyncExternalStore(subscribe, hasPending, hasPending);
  useEffect(() => {
    if (!waiting || !hasData || !pending || !request) return;
    const definition = pending;
    pending = null;
    request = { ...request, started: true };
    execute(definition);
  }, [waiting, hasData, execute]);
}
