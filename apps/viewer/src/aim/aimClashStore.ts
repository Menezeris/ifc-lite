/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav clash z AIM (D-164): ktorý test v AIM (id a verzia) patrí presetu v paneli clash, výsledok posledného
 * uloženia, čakajúci beh z chatu a uložené dvojice na porovnanie. Lenivý modul (číta ho `aimClash.ts`, lišta
 * a `viewQueries.ts`); vstupný balík ho nevidí.
 */

import { create } from 'zustand';
import { useViewerStore } from '../store/index.js';
import type { ClashPreset } from '@/store/slices/clashSlice';
import { runRequestOf } from '@/lib/clash/run-request';
import type { ClashAimResult } from './clash-protocol.js';
import { setClashLocalDescriber } from './clashLocal.js';
import {
  buildTest, countStatuses, describeClash, matchRun, pairKey, reviewRows, signature, type ClashLike, type ClashSettingsInput,
} from './aimClashPlan.js';

export interface ClashSlot {
  id: string;
  version: number;
  /** Preset v paneli clash, ktorý patrí tomuto testu (jeho id je aj pravidlo v kľúčoch kontrol). */
  presetId: string;
  /** Podpis testu a stavov pri načítaní alebo poslednom uložení (`signature`). */
  baseline: string;
}

export interface ClashStatus {
  kind: 'saving' | 'saved' | 'conflict' | 'error';
  id?: string;
  version?: number;
  latest?: number;
  error?: string;
}

export interface AimClashState {
  slot: ClashSlot | null;
  status: ClashStatus | null;
  /** Beh z chatu čaká na panel clash; spustí ho lišta raz. */
  run: { seq: number } | null;
  /** Dvojice uloženého behu, podľa nich lišta ukáže, koľko sa v čerstvom behu našlo. */
  expected: ClashAimResult[] | null;
}

export const useAimClash = create<AimClashState>()(() => ({ slot: null, status: null, run: null, expected: null }));

type Viewer = ReturnType<typeof useViewerStore.getState>;

/** Preset v paneli clash, o ktorom je reč: ten z AIM, inak ten, z ktorého je posledný výsledok. */
export function activePreset(v: Viewer, slot: ClashSlot | null): ClashPreset | undefined {
  const req = runRequestOf(v.clashRawResult);
  const id = slot?.presetId ?? (req?.kind === 'preset' ? req.presetId : undefined);
  return id ? v.clashPresets.find((p) => p.id === id) : undefined;
}

export const settingsOf = (v: Viewer, p: ClashPreset): ClashSettingsInput => ({
  name: p.name, selectorA: p.selectorA, selectorB: p.selectorB, mode: v.clashMode, tolerance: v.clashTolerance, clearance: v.clashClearance,
});

/** Podpis toho, čo používateľ v paneli nastavil a rozhodol, pre `dirty`. */
export function currentSignature(v: Viewer, p: ClashPreset): string {
  return signature(buildTest(settingsOf(v, p)), reviewRows(p.id, v.clashReviews));
}

/** `view_state.clash_local` (D-164): otvorený test, beh, počty podľa stavu, upravené či nie. */
export function describeClashLocal(): Record<string, unknown> | undefined {
  const aim = useAimClash.getState();
  const v = useViewerStore.getState();
  const preset = activePreset(v, aim.slot);
  if (!preset) return undefined;
  const mine = v.clashRawResult?.clashes.filter((c) => c.rule === preset.id) ?? [];
  const status = (c: ClashLike) => v.clashReviews.get(pairKey(preset.id, c.a.key, c.b.key))?.status ?? 'open';
  const test = buildTest(settingsOf(v, preset));
  const linked = aim.slot?.presetId === preset.id ? aim.slot : null;
  return describeClash({
    test: linked, name: preset.name, mode: test.mode, tolerance_mm: test.tolerance_mm,
    hasRun: v.clashRawResult != null && runRequestOf(v.clashRawResult)?.kind === 'preset', running: v.clashRunning,
    counts: countStatuses(mine.map((c) => ({ status: status(c) }))), total: mine.length,
    dirty: !!linked && currentSignature(v, preset) !== linked.baseline,
    ...(aim.expected ? { missing: matchRun(aim.expected, mine, preset.id).missing } : {}),
  });
}

setClashLocalDescriber(describeClashLocal);
