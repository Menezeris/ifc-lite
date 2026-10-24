/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav clash z AIM (D-164): ktorý test v AIM (kód) patrí presetu v paneli clash, stavy dvojíc, od ktorých sa vychádzalo
 * (podľa nich sa pozná zmena), výsledok posledného uloženia a čakajúci beh z chatu. K tomu pomocníci, ktorí
 * prekladajú medzi tvarom hosta (trieda, model, podlažie) a presetom panela (selektor a filter). Lenivý modul
 * (číta ho `aimClash.ts`, lišta a `viewQueries.ts` cez `clashLocal.ts`); vstupný balík ho nevidí.
 */

import { create } from 'zustand';
import { Rule } from '@ifc-lite/rules';
import { useViewerStore } from '../store/index.js';
import type { ClashPreset } from '@/store/slices/clashSlice';
import type { ClashSetFilter } from '@/lib/clash/set-filter';
import { runRequestOf } from '@/lib/clash/run-request';
import type { ClashElementWire, ClashResultWire, ClashSideWire, ClashTestWire } from './clash-protocol.js';
import {
  buildTest, countRun, describeClash, knownPairs, matchRun, reviewChanges, reviewSnapshot, testSignature,
  type ClashRich, type ReviewState,
} from './aimClashPlan.js';
import { setClashLocalDescriber } from './clashLocal.js';

type Viewer = ReturnType<typeof useViewerStore.getState>;
type Models = Viewer['models'];

export interface ClashSlot {
  code: string;
  /** Preset v paneli clash, ktorý patrí tomuto testu (jeho id je aj pravidlo v kľúčoch kontrol). */
  presetId: string;
  /** Podpis testu pri načítaní alebo poslednom uložení (`testSignature`). */
  testSig: string;
  /** Stavy dvojíc, od ktorých sa vychádzalo: to, čo AIM poslalo, alebo čo sa naposledy uložilo. */
  reviews: Map<string, ReviewState>;
}

export interface ClashStatus {
  kind: 'saving' | 'saved' | 'error';
  error?: string;
  results?: number;
  reviews?: number;
  notes?: string[];
}

export interface AimClashState {
  slot: ClashSlot | null;
  status: ClashStatus | null;
  /** Beh z chatu čaká na panel clash; spustí ho lišta raz. */
  run: { seq: number } | null;
  /** Výsledky uloženého behu z AIM (stav a poznámka) a jeho id: podľa nich lišta ukáže, koľko sa našlo znova. */
  loaded: { runId?: string; results: ClashResultWire[] } | null;
}

export const useAimClash = create<AimClashState>()(() => ({ slot: null, status: null, run: null, loaded: null }));

/** Meno modelu, ako ho pozná host (štítok modelu vo federácii). */
export const labelOf = (models: Models) => (modelId: string): string => models.get(modelId)?.name ?? modelId;

const stripExt = (s: string): string => s.replace(/\.(ifc|ifcx|ifczip)$/i, '').toLowerCase();

/** Model podľa štítku z AIM: presné meno, meno bez prípony alebo id. */
export function modelByLabel(models: Models, label: string): ReturnType<Models['get']> {
  const want = stripExt(label);
  for (const m of models.values()) if (m.name === label || m.id === label || stripExt(m.name) === want) return m;
  return undefined;
}

const ruleValue = (m: { id: string; sourceFingerprint?: string }): string => m.sourceFingerprint ?? m.id;

/** Strana testu (trieda, model, podlažie) ako filter panela; bez modelu a podlažia nie je čo filtrovať. */
export function filterOf(side: ClashSideWire, models: Models): ClashSetFilter | undefined {
  const rules = [];
  if (side.model) {
    const m = modelByLabel(models, side.model);
    // Model, ktorý nie je načítaný, nesmie sadu potichu rozšíriť: pravidlo s neznámou hodnotou nezodpovedá ničomu.
    rules.push(Rule.model([m ? ruleValue(m) : side.model]));
  }
  if (side.storey) rules.push(Rule.storey([side.storey]));
  return rules.length ? [{ rules, combinator: 'AND' }] : undefined;
}

/** Strana presetu späť na tvar hosta; filter, ktorý nie je jedna skupina model a podlažie, sa nezobrazí (vidno len triedu). */
export function sideOf(selector: string, filter: ClashSetFilter | undefined, models: Models): ClashSideWire {
  const side: ClashSideWire = { type: selector };
  const group = filter && filter.length === 1 && filter[0]!.combinator === 'AND' ? filter[0]! : null;
  for (const rule of group?.rules ?? []) {
    if (rule.kind === 'model' && rule.op === 'in' && rule.values.length === 1) {
      const v = rule.values[0]!;
      side.model = [...models.values()].find((m) => ruleValue(m) === v)?.name ?? v;
    } else if (rule.kind === 'storey' && rule.op === 'in' && rule.values.length === 1) side.storey = rule.values[0]!;
  }
  return side;
}

/** Preset, o ktorom je reč: ten z AIM, inak ten, z ktorého je posledný výsledok. */
export function activePreset(v: Viewer, slot: ClashSlot | null): ClashPreset | undefined {
  const req = runRequestOf(v.clashRawResult);
  const id = slot?.presetId ?? (req?.kind === 'preset' ? req.presetId : undefined);
  return id ? v.clashPresets.find((p) => p.id === id) : undefined;
}

/** Test z presetu a globálneho nastavenia panela. */
export function testOf(v: Viewer, p: ClashPreset, code?: string): ClashTestWire {
  return buildTest({
    ...(code ? { code } : {}), name: p.name, mode: v.clashMode === 'clearance' ? 'clearance' : 'hard', tolerance: v.clashTolerance, clearance: v.clashClearance,
    a: sideOf(p.selectorA, p.filterA, v.models), b: sideOf(p.selectorB, p.filterB, v.models),
  });
}

/** Kolízie behu v tvare pre čistú logiku (`Clash` je s ním zhodný). */
export const clashesOf = (v: Viewer): ClashRich[] => (v.clashRawResult?.clashes ?? []) as ClashRich[];

/** Dvojice, ktoré viewer pozná s modelom: z čerstvého behu a z výsledkov načítaných z AIM. */
export function knownOf(v: Viewer, rule: string, loaded: AimClashState['loaded']): ReturnType<typeof knownPairs> {
  const label = labelOf(v.models);
  const el = (e: ClashRich['a']): ClashElementWire => ({ model: label(e.model), guid: e.key, type: e.tag, ...(e.name ? { name: e.name } : {}) });
  const rows = [...(loaded?.results ?? []), ...clashesOf(v).filter((c) => c.rule === rule).map((c) => ({ a: el(c.a), b: el(c.b) }))];
  return knownPairs(rule, rows);
}

/** Zmenené stavy voči tomu, od čoho sa vychádzalo (pre `CLASH_SAVE` aj pre `clash_local`). */
export function changesOf(v: Viewer, slot: ClashSlot | null, preset: ClashPreset, loaded: AimClashState['loaded']): ReturnType<typeof reviewChanges> {
  const current = reviewSnapshot(preset.id, v.clashReviews);
  return reviewChanges(current, slot?.presetId === preset.id ? slot.reviews : new Map(), knownOf(v, preset.id, loaded));
}

/** Podpis toho, čo viewer drží (kľúč dvojice a stav), na porovnanie pri načítaní a uložení. */
export const snapshotOf = (v: Viewer, rule: string): Map<string, ReviewState> => reviewSnapshot(rule, v.clashReviews);

/** `view_state.clash_local` (D-164): otvorený test, beh, počty podľa stavu, zmenené stavy a či je upravený. */
export function describeClashLocal(): Record<string, unknown> | undefined {
  const aim = useAimClash.getState();
  const v = useViewerStore.getState();
  const preset = activePreset(v, aim.slot);
  if (!preset) return undefined;
  const linked = aim.slot?.presetId === preset.id ? aim.slot : null;
  const test = testOf(v, preset, linked?.code);
  const req = runRequestOf(v.clashRawResult);
  const ranHere = req?.kind === 'preset' && req.presetId === preset.id;
  const clashes = clashesOf(v);
  const { changes } = changesOf(v, aim.slot, preset, aim.loaded);
  const selected = v.clashSelectedId ? v.clashRawResult?.clashes.find((c) => c.id === v.clashSelectedId) : undefined;
  const label = labelOf(v.models);
  const el = (e: ClashRich['a']): ClashElementWire => ({ model: label(e.model), guid: e.key });
  return describeClash({
    test, fromAim: !!linked, dirty: !linked || testSignature(test) !== linked.testSig || changes.length > 0,
    run: ranHere ? { ...countRun(preset.id, clashes, (k) => v.clashReviews.get(k)?.status), ...(aim.loaded?.runId ? { id: aim.loaded.runId } : {}) } : null,
    selected: selected && selected.rule === preset.id ? { a: el(selected.a as ClashRich['a']), b: el(selected.b as ClashRich['a']) } : null,
    reviews: changes,
    ...(aim.loaded && ranHere ? { missing: matchRun(aim.loaded.results, clashes, preset.id).missing } : {}),
  });
}

setClashLocalDescriber(describeClashLocal);
